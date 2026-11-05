"""Helpers for reading audit JSON regardless of the prompt/schema flavour.

The audit worker stores whatever JSON the LLM returned. Over time the prompt
schema has changed (fixed 5 legacy sections, 7-parameter QA prompts, the
Prompt Builder's 8-parameter `parameter_scores` array, ...). Everything that
renders or aggregates audit data should go through these helpers instead of
assuming a fixed set of section names.
"""
import json
import re
from typing import Any, Dict, List, Optional

from app.services.scoring_service import section_percentage


FALLBACK_LABELS = {
    "opening": "Opening",
    "customer_understanding": "Customer Understanding",
    "resolution_quality": "Resolution Quality",
    "communication": "Communication",
    "call_control": "Call Control",
    "process_adherence": "Process Adherence",
    "closing": "Closing",
    "probing_resolution": "Probing & Resolution",
    "process_compliance": "Process & Compliance",
    "closure": "Closure",
}


def coerce_json(raw: Any) -> Dict[str, Any]:
    """Return `raw` as a dict, decoding JSON strings when necessary."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = raw.decode("utf-8")
        except Exception:
            return {}
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def slugify(value: Any, fallback: str = "param") -> str:
    text = re.sub(r"[^a-zA-Z0-9]+", "_", str(value or "").lower()).strip("_")
    return text or fallback


def pretty_label(key: Any) -> str:
    text = str(key or "")
    return FALLBACK_LABELS.get(text) or text.replace("_", " ").title()


def parameter_meta_from_config(config: Any) -> List[Dict[str, Any]]:
    """Build stable display metadata from an ai_prompts.prompt_json config."""
    cfg = coerce_json(config)
    params = cfg.get("parameters")
    if not isinstance(params, list):
        return []

    meta: List[Dict[str, Any]] = []
    used = set()
    for index, param in enumerate(params):
        if not isinstance(param, dict):
            continue
        label = str(param.get("name") or param.get("id") or f"Parameter {index + 1}")
        key = slugify(param.get("name") or param.get("id") or f"param_{index + 1}")
        if key in used:
            key = f"{key}_{index + 1}"
        used.add(key)
        meta.append({
            "key": key,
            "id": param.get("id"),
            "label": label,
            "weight": _to_float(param.get("weight"), 0.0),
            "priority": param.get("priority"),
            "description": param.get("description") or "",
        })
    return meta


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _section_dict(raw: Any) -> Optional[Dict[str, Any]]:
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, (int, float)):
        value = _to_float(raw)
        return {"score": value, "max_score": 100.0, "percentage": value}
    return None


def extract_sections(audit: Any) -> Dict[str, Dict[str, Any]]:
    """Return `{key: section}` for any supported audit JSON shape."""
    data = coerce_json(audit)

    raw_sections = data.get("sections")
    if isinstance(raw_sections, dict) and raw_sections:
        sections: Dict[str, Dict[str, Any]] = {}
        for key, raw in raw_sections.items():
            section = _section_dict(raw)
            if section is not None:
                sections[str(key)] = section
        if sections:
            return sections

    raw_params = data.get("parameter_scores")
    if isinstance(raw_params, list):
        sections = {}
        for index, item in enumerate(raw_params):
            if isinstance(item, dict):
                name = (
                    item.get("key") or item.get("parameter") or item.get("param")
                    or item.get("name") or item.get("label") or item.get("id")
                )
                key = slugify(name, f"param_{index + 1}")
                section = _section_dict(item)
                if section is None:
                    continue
                if name:
                    section.setdefault("label", str(name))
                sections[key] = section
            elif isinstance(item, (int, float)):
                sections[f"param_{index + 1}"] = _section_dict(item) or {}
        if sections:
            return sections

    return {}


def audit_parameter_meta(audit: Any) -> List[Dict[str, Any]]:
    """Return parameter metadata stored in the audit, or derive it from sections."""
    data = coerce_json(audit)
    meta = data.get("parameter_meta")
    if isinstance(meta, list):
        cleaned = [m for m in meta if isinstance(m, dict) and m.get("key")]
        if cleaned:
            return cleaned

    return [
        {"key": key, "label": pretty_label(key)}
        for key in extract_sections(data)
    ]


def rag(pct: float) -> str:
    if pct >= 80:
        return "green"
    if pct >= 60:
        return "amber"
    return "red"


def aggregate_parameters(audits: List[Any]) -> List[Dict[str, Any]]:
    """Aggregate section percentages across audits into a dynamic parameter list.

    `audits` should be ordered newest-first. When the newest audit carries
    `parameter_meta` (written by the normaliser), that defines the displayed
    order and labels so the UI always mirrors the active prompt.
    """
    ordered_keys: List[str] = []
    labels: Dict[str, str] = {}
    weights: Dict[str, float] = {}
    percentages: Dict[str, List[float]] = {}
    scores: Dict[str, float] = {}
    maxes: Dict[str, float] = {}

    # Prefer the parameter contract of the newest audit that has one.
    for audit in audits:
        meta = audit_parameter_meta(audit)
        data = coerce_json(audit)
        if isinstance(data.get("parameter_meta"), list) and meta:
            for item in meta:
                key = str(item.get("key"))
                if key not in ordered_keys:
                    ordered_keys.append(key)
                labels.setdefault(key, str(item.get("label") or pretty_label(key)))
                if item.get("weight") is not None:
                    weights.setdefault(key, _to_float(item.get("weight")))
            break

    for audit in audits:
        sections = extract_sections(audit)
        for key, section in sections.items():
            if key not in ordered_keys:
                ordered_keys.append(key)
            if key not in labels:
                labels[key] = str(section.get("label") or pretty_label(key))
            if key in sections and section.get("weight") is not None:
                weights.setdefault(key, _to_float(section.get("weight")))

            pct = section_percentage(section)
            if pct or _to_float(section.get("max_score")) > 0:
                percentages.setdefault(key, []).append(pct)
            scores[key] = scores.get(key, 0.0) + _to_float(section.get("score"))
            maxes[key] = maxes.get(key, 0.0) + _to_float(section.get("max_score"))

    result: List[Dict[str, Any]] = []
    for key in ordered_keys:
        values = percentages.get(key) or []
        if values:
            pct = round(sum(values) / len(values), 1)
        elif maxes.get(key):
            pct = round((scores.get(key, 0.0) / maxes[key]) * 100, 1)
        else:
            pct = 0.0
        pct = round(max(0.0, min(100.0, pct)), 1)
        item = {
            "key": key,
            "label": labels.get(key) or pretty_label(key),
            "percentage": pct,
            "color": rag(pct),
        }
        if weights.get(key):
            item["weight"] = round(weights[key], 1)
        result.append(item)

    return result


def ordered_section_keys(audits: List[Any]) -> List[str]:
    """Return display keys for audits, newest-first, mirroring the active prompt."""
    return [item["key"] for item in aggregate_parameters(audits)]
