import asyncio
import json
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.core.config import get_settings
from app.services.audit_params import (
    parameter_meta_from_config,
    pretty_label,
    slugify,
)
from app.services.scoring_service import derive_scoring, normalize_section_scores


def _extract_json(content: str) -> Dict[str, Any]:
    text = (content or "").strip()
    if not text:
        return {}
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return {}
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


# ═══════════════════════════════════════════════════════════
# SUPPLEMENTARY SALES CLASSIFICATION FIELDS
# ═══════════════════════════════════════════════════════════
# This block used to replace the prompt's own output schema with a fixed
# 5-section schema. That made every Prompt Builder prompt (8 parameters,
# parameter_scores, overall_score, ...) produce output the UI could not read.
# We now only *add* sales-classification fields and explicitly tell the model
# to keep the prompt's own output schema intact.
SALES_SUPPLEMENT = """

═══════════════════════════════════════════════════════════
ADDITIONAL SALES CLASSIFICATION FIELDS
═══════════════════════════════════════════════════════════
Add the following keys to the SAME JSON object you already return. Do not
replace, rename or remove any field required by the output format above.

{
  "call_connected": true | false,
  "purchase_discussed": true | false,
  "intent_validated": true | false,
  "confirmation_received": true | false,
  "required_info_collected": true | false,
  "order_after_confirmation": true | false,
  "crm_matches_conversation": true | false,
  "crm_sale_done": true | false,
  "customer_confirmation": "Confirmed" | "Not Confirmed",
  "order_information": "Complete" | "Incomplete" | "Not Available"
}

Classification rules:
- Genuine: call_connected, purchase_discussed, intent_validated,
  confirmation_received, required_info_collected and order_after_confirmation
  are ALL true.
- Invalid: call connected and purchase discussed, but at least one of
  confirmation_received / required_info_collected / order_after_confirmation
  is false. Set invalid_reason to "Not Confirmed", "Without Information" or
  "Forcefully Placed".
- Unknown: call not connected, or purchase not discussed.
- Use null for invalid_reason unless the category is Invalid.
═══════════════════════════════════════════════════════════
"""


def build_audit_prompt(
    template: str,
    transcript: str,
    prompt_config: Optional[Dict[str, Any]] = None,
) -> str:
    template = (template or "").strip()
    if not template:
        raise RuntimeError("No client prompt configured for AI audit.")
    transcript = (transcript or "").strip() or "[EMPTY TRANSCRIPT]"

    parts = [template, SALES_SUPPLEMENT.strip()]

    if parameter_meta_from_config(prompt_config):
        parts.append(
            "IMPORTANT: Keep the output format/schema already defined in the "
            "prompt above. Do not replace its fields with a different schema. "
            "Add the sales classification fields above to the same JSON object."
        )

    return (
        "\n\n".join(parts)
        + "\n\n═══════════════════════════════════════════════════════════\n"
        "TRANSCRIPT TO AUDIT:\n"
        "═══════════════════════════════════════════════════════════\n"
        f"{transcript}\n\n"
        "Return ONLY valid JSON."
    )


# ═══════════════════════════════════════════════════════════
# OPENAI PROVIDER
# ═══════════════════════════════════════════════════════════
async def _run_openai(prompt: str, api_key: str, model: str, base_url: str) -> Dict[str, Any]:
    url = f"{(base_url or 'https://api.openai.com/v1').rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a call quality auditor. Return ONLY valid JSON following the requested schema EXACTLY."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
    choices = data.get("choices") or []
    if not choices:
        return {}
    content = choices[0].get("message", {}).get("content") or ""
    return _extract_json(content)


# ═══════════════════════════════════════════════════════════
# OPENROUTER PROVIDER
# ═══════════════════════════════════════════════════════════
async def _run_openrouter(prompt: str, api_key: str, model: str, base_url: str) -> Dict[str, Any]:
    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "CallIQ",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a call quality auditor. Return ONLY valid JSON following the requested schema EXACTLY."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
    choices = data.get("choices") or []
    if not choices:
        return {}
    content = choices[0].get("message", {}).get("content") or ""
    return _extract_json(content)


# ═══════════════════════════════════════════════════════════
# MOCK
# ═══════════════════════════════════════════════════════════
def _mock_audit_response(prompt_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    meta = parameter_meta_from_config(prompt_config)
    if meta:
        sections = {
            item["key"]: {
                "score": 8,
                "max_score": 10,
                "percentage": 80,
                "label": item["label"],
                "weight": item.get("weight", 0),
            }
            for item in meta
        }
        total_score = 80
    else:
        sections = {
            "opening": {"score": 18, "max_score": 20, "percentage": 90},
            "communication": {"score": 16, "max_score": 20, "percentage": 80},
            "probing_resolution": {"score": 12, "max_score": 15, "percentage": 80},
            "process_compliance": {"score": 19, "max_score": 25, "percentage": 76},
            "closure": {"score": 15, "max_score": 20, "percentage": 75},
        }
        total_score = 80

    return {
        "total_score": total_score,
        "percentage": total_score,
        "overall_score": total_score,
        "ranking": "Good",
        "sections": sections,
        "sale_category": "Genuine",
        "invalid_reason": None,
        "crm_sale_done": True,
        "customer_confirmation": "Confirmed",
        "order_information": "Complete",
        "call_connected": True,
        "purchase_discussed": True,
        "intent_validated": True,
        "confirmation_received": True,
        "required_info_collected": True,
        "order_after_confirmation": True,
        "crm_matches_conversation": True,
        "summary": "The agent handled the call professionally.",
        "recommendations": ["Continue reinforcing active listening."],
    }


# ═══════════════════════════════════════════════════════════
# NORMALIZE — supports Prompt Builder + legacy section schemas
# ═══════════════════════════════════════════════════════════
def _match_meta(name: Any, meta: List[Dict[str, Any]], index: Optional[int] = None):
    if name not in (None, ""):
        slug = slugify(name)
        for item in meta:
            if slug == item["key"] or slug == slugify(item.get("label")):
                return item
            if str(name).strip().lower() == str(item.get("id") or "").strip().lower():
                return item
    if index is not None and 0 <= index < len(meta):
        return meta[index]
    return None


def _sections_from_parameter_scores(
    data: Dict[str, Any],
    meta: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    raw = data.get("parameter_scores")
    if not isinstance(raw, list):
        return {}

    sections: Dict[str, Dict[str, Any]] = {}
    for index, item in enumerate(raw):
        if isinstance(item, dict):
            name = (
                item.get("key") or item.get("parameter") or item.get("param")
                or item.get("name") or item.get("label") or item.get("id")
            )
            matched = _match_meta(name, meta, index)
            key = matched["key"] if matched else slugify(name, f"param_{index + 1}")

            max_score = _to_float(item.get("max_score") or item.get("max"), 100.0)
            if max_score <= 0:
                max_score = 100.0

            percentage = item.get("percentage")
            score = item.get("score")
            if percentage is None:
                if score is None:
                    percentage = 0.0
                else:
                    score_value = _to_float(score)
                    if score_value <= max_score:
                        percentage = (score_value / max_score) * 100
                    else:
                        percentage = score_value
            if score is None:
                score = (max_score * _to_float(percentage)) / 100.0

            section = {
                "score": round(_clamp(_to_float(score), 0, max_score), 1),
                "max_score": max_score,
                "percentage": round(_clamp(_to_float(percentage)), 1),
            }
            if name:
                section["label"] = str(matched["label"] if matched else name)
            if matched:
                section["label"] = matched["label"]
                section["weight"] = matched.get("weight", 0)
            sections[key] = section

        elif isinstance(item, (int, float)):
            matched = _match_meta(None, meta, index)
            key = matched["key"] if matched else f"param_{index + 1}"
            percentage = _clamp(_to_float(item))
            section = {
                "score": round(percentage, 1),
                "max_score": 100.0,
                "percentage": round(percentage, 1),
            }
            if matched:
                section["label"] = matched["label"]
                section["weight"] = matched.get("weight", 0)
            sections[key] = section

    return sections


def _remap_sections(
    sections: Dict[str, Any],
    meta: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """Align model-provided section keys with the active prompt contract."""
    if not meta or not sections:
        return sections

    exact = sum(1 for key in sections if any(slugify(key) == m["key"] for m in meta))
    if exact == 0 and len(sections) != len(meta):
        # Model returned a different schema (e.g. legacy 5 sections) — keep it.
        return sections

    remapped: Dict[str, Dict[str, Any]] = {}
    for index, (key, raw) in enumerate(sections.items()):
        if not isinstance(raw, dict):
            continue
        matched = _match_meta(key, meta, index if len(sections) == len(meta) else None)
        new_key = matched["key"] if matched else key
        section = dict(raw)
        if matched:
            section["label"] = matched["label"]
            section["weight"] = matched.get("weight", 0)
        remapped[new_key] = section
    return remapped or sections


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_audit_json(
    audit_json: Dict[str, Any],
    prompt_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    data = dict(audit_json or {})
    meta = parameter_meta_from_config(prompt_config)

    # Prompt Builder returns `parameter_scores`; legacy prompts return `sections`.
    if not isinstance(data.get("sections"), dict) or not data.get("sections"):
        converted = _sections_from_parameter_scores(data, meta)
        if converted:
            data["sections"] = converted

    if meta and isinstance(data.get("sections"), dict):
        data["sections"] = _remap_sections(data["sections"], meta)

    payload = normalize_section_scores(data)

    # Persist the active prompt's parameter contract so the UI can render the
    # same labels/weights that were saved in Prompt Builder.
    if meta:
        payload["parameter_meta"] = meta
    else:
        payload["parameter_meta"] = [
            {
                "key": key,
                "label": str(section.get("label") or pretty_label(key)),
            }
            for key, section in (payload.get("sections") or {}).items()
        ]

    payload["parameter_scores"] = [
        {
            "key": key,
            "label": str(section.get("label") or pretty_label(key)),
            "score": section.get("score", 0),
            "max_score": section.get("max_score", 100),
            "percentage": section.get("percentage", 0),
        }
        for key, section in (payload.get("sections") or {}).items()
    ]

    total_score, percentage, derived_ranking, fatal_flag = derive_scoring(payload)

    payload["total_score"] = int(total_score) if float(total_score).is_integer() else total_score
    payload["percentage"] = int(percentage) if float(percentage).is_integer() else percentage
    payload["ranking"] = derived_ranking
    payload["fatal_flag"] = fatal_flag
    if "fatal" not in payload:
        payload["fatal"] = int(fatal_flag)
    payload.setdefault("areas_for_improvement", [])

    # ═══ SALES CLASSIFICATION ═══
    # Only recompute when the model actually returned the classification
    # booleans. Otherwise a QA-only prompt would turn every call into
    # "Unknown" even when the model supplied a category.
    bool_keys = (
        "call_connected", "purchase_discussed", "intent_validated",
        "confirmation_received", "required_info_collected",
        "order_after_confirmation",
    )
    has_booleans = any(key in payload for key in bool_keys)

    if has_booleans:
        call_connected = bool(payload.get("call_connected", False))
        purchase_discussed = bool(payload.get("purchase_discussed", False))
        intent_validated = bool(payload.get("intent_validated", False))
        confirmation_received = bool(payload.get("confirmation_received", False))
        required_info_collected = bool(payload.get("required_info_collected", False))
        order_after_confirmation = bool(payload.get("order_after_confirmation", False))

        computed_category = "Unknown"
        computed_reason = None
        if not call_connected or not purchase_discussed:
            computed_category = "Unknown"
            computed_reason = None
        elif (intent_validated and confirmation_received
              and required_info_collected and order_after_confirmation):
            computed_category = "Genuine"
            computed_reason = None
        else:
            computed_category = "Invalid"
            if not confirmation_received:
                computed_reason = "Not Confirmed"
            elif not required_info_collected or not order_after_confirmation:
                computed_reason = "Without Information"
            elif not intent_validated:
                computed_reason = "Forcefully Placed"
            else:
                computed_reason = "Not Confirmed"

        ai_category = payload.get("sale_category")
        if ai_category != computed_category:
            print(f"[ai_audit] WARN overriding AI sale_category '{ai_category}' -> '{computed_category}'")

        payload["sale_category"] = computed_category
        payload["invalid_reason"] = computed_reason
    else:
        category = payload.get("sale_category") or "Unknown"
        if category not in ("Genuine", "Invalid", "Unknown"):
            category = "Unknown"
        payload["sale_category"] = category
        if category != "Invalid":
            payload["invalid_reason"] = None

    payload.setdefault("crm_sale_done", False)
    payload.setdefault(
        "customer_confirmation",
        "Confirmed" if payload.get("confirmation_received") else "Not Confirmed",
    )
    payload.setdefault(
        "order_information",
        "Complete" if payload.get("required_info_collected") else "Not Available",
    )

    return payload


# ═══════════════════════════════════════════════════════════
# MAIN ENTRY
# ═══════════════════════════════════════════════════════════
async def run_ai_audit(
    prompt: str,
    transcript: str = "",
    voice_mail: bool = False,
    prompt_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if voice_mail:
        return {}
    template = (prompt or "").strip()
    if not template:
        raise RuntimeError("No client prompt configured for AI audit.")

    settings = get_settings()
    user_prompt = build_audit_prompt(template, transcript, prompt_config)

    # Priority 1: OpenAI
    if settings.openai_api_key:
        try:
            print(f"[ai_audit] Trying OpenAI ({settings.openai_model})...")
            raw = await _run_openai(
                user_prompt, settings.openai_api_key,
                settings.openai_model, settings.openai_base_url,
            )
            if raw:
                print(f"[ai_audit] OK OpenAI returned {len(raw)} keys")
                return _normalize_audit_json(raw, prompt_config)
            print("[ai_audit] WARN OpenAI returned empty")
        except Exception as e:
            print(f"[ai_audit] FAIL OpenAI failed: {e}")

    # Priority 2: OpenRouter
    if settings.openrouter_api_key:
        try:
            print(f"[ai_audit] Trying OpenRouter ({settings.openrouter_model})...")
            raw = await _run_openrouter(
                user_prompt, settings.openrouter_api_key,
                settings.openrouter_model, settings.openrouter_base_url,
            )
            if raw:
                print(f"[ai_audit] OK OpenRouter returned {len(raw)} keys")
                return _normalize_audit_json(raw, prompt_config)
            print("[ai_audit] WARN OpenRouter returned empty")
        except Exception as e:
            print(f"[ai_audit] FAIL OpenRouter failed: {e}")

    # Priority 3: Mock
    if settings.llm_mock_enabled:
        print("[ai_audit] Using MOCK response")
        return _normalize_audit_json(_mock_audit_response(prompt_config), prompt_config)

    raise RuntimeError(
        "No LLM provider available. Set OPENAI_API_KEY, OPENROUTER_API_KEY "
        "or LLM_MOCK_ENABLED=true"
    )
