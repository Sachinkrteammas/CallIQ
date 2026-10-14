import asyncio
import json
import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.services.scoring_service import derive_scoring, normalize_section_scores


def _extract_json(content: str) -> dict[str, Any]:
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
# STRICT SALES CATEGORIZATION SCHEMA
# ═══════════════════════════════════════════════════════════
SALES_CATEGORIZATION_SCHEMA = """

═══════════════════════════════════════════════════════════
MANDATORY SALES CATEGORIZATION — FOLLOW THESE RULES STRICTLY
═══════════════════════════════════════════════════════════

You MUST evaluate the sales conversation using this hierarchy:

STEP 1: Was call connected? → call_connected (true/false)
STEP 2: Was purchase/order discussed? → purchase_discussed (true/false)
STEP 3: Did customer express intent? → intent_validated (true/false)
STEP 4: Did customer confirm order? → confirmation_received (true/false)
STEP 5: Were required details captured? → required_info_collected (true/false)
STEP 6: Was order placed only after confirmation? → order_after_confirmation (true/false)
STEP 7: Does CRM tag match conversation? → crm_matches_conversation (true/false)

═══════════════════════════════════════════════════════════
CRITICAL CLASSIFICATION RULES (FOLLOW EXACTLY):
═══════════════════════════════════════════════════════════

sale_category = "Genuine" ONLY IF ALL of these are TRUE:
  - call_connected = true
  - purchase_discussed = true
  - intent_validated = true
  - confirmation_received = true
  - required_info_collected = true
  - order_after_confirmation = true

sale_category = "Invalid" IF:
  - call_connected = true
  - purchase_discussed = true
  - BUT at least one of these is FALSE: confirmation_received, required_info_collected, order_after_confirmation

sale_category = "Unknown" ONLY IF:
  - call_connected = false, OR
  - purchase_discussed = false

═══════════════════════════════════════════════════════════
INVALID REASON (only when sale_category = "Invalid"):
═══════════════════════════════════════════════════════════

- "Not Confirmed"       → confirmation_received = false
- "Without Information" → required_info_collected = false OR order_after_confirmation = false
- "Forcefully Placed"   → intent_validated = false BUT order still placed

═══════════════════════════════════════════════════════════
EXAMPLES (follow this logic):
═══════════════════════════════════════════════════════════

Example 1 (Genuine):
  call_connected=true, purchase_discussed=true, intent_validated=true,
  confirmation_received=true, required_info_collected=true, order_after_confirmation=true
  → sale_category = "Genuine", invalid_reason = null

Example 2 (Invalid - Not Confirmed):
  call_connected=true, purchase_discussed=true, intent_validated=true,
  confirmation_received=false, required_info_collected=false, order_after_confirmation=false
  → sale_category = "Invalid", invalid_reason = "Not Confirmed"

Example 3 (Invalid - Without Information):
  call_connected=true, purchase_discussed=true, intent_validated=true,
  confirmation_received=true, required_info_collected=false, order_after_confirmation=true
  → sale_category = "Invalid", invalid_reason = "Without Information"

═══════════════════════════════════════════════════════════
MANDATORY JSON OUTPUT (ALL fields required — missing fields = invalid)
═══════════════════════════════════════════════════════════

{
  "total_score": <integer 0-100>,
  "percentage": <integer 0-100>,
  "ranking": "Excellent" | "Good" | "Average" | "Poor" | "Critical",

  "sections": {
    "opening": {"score": <int 0-20>, "max_score": 20, "percentage": <int 0-100>},
    "communication": {"score": <int 0-20>, "max_score": 20, "percentage": <int 0-100>},
    "probing_resolution": {"score": <int 0-15>, "max_score": 15, "percentage": <int 0-100>},
    "process_compliance": {"score": <int 0-25>, "max_score": 25, "percentage": <int 0-100>},
    "closure": {"score": <int 0-20>, "max_score": 20, "percentage": <int 0-100>}
  },

  "sale_category": "Genuine" | "Invalid" | "Unknown",
  "invalid_reason": "Forcefully Placed" | "Not Confirmed" | "Without Information" | null,
  "crm_sale_done": true | false,
  "customer_confirmation": "Confirmed" | "Not Confirmed",
  "order_information": "Complete" | "Incomplete" | "Not Available",

  "call_connected": true | false,
  "purchase_discussed": true | false,
  "intent_validated": true | false,
  "confirmation_received": true | false,
  "required_info_collected": true | false,
  "order_after_confirmation": true | false,
  "crm_matches_conversation": true | false,

  "summary": "<one paragraph summary of the call>",
  "recommendations": ["<actionable recommendation 1>", "<actionable recommendation 2>"]
}

RULES:
- Return ONLY valid JSON. No markdown, no extra text.
- ALL fields MUST be present.
- Follow the classification rules EXACTLY.
- Sections scores MUST add up to total_score.
═══════════════════════════════════════════════════════════
"""


def build_audit_prompt(template: str, transcript: str) -> str:
    template = (template or "").strip()
    if not template:
        raise RuntimeError("No client prompt configured for AI audit.")
    transcript = (transcript or "").strip() or "[EMPTY TRANSCRIPT]"
    return (
        f"{template}\n"
        f"{SALES_CATEGORIZATION_SCHEMA}\n\n"
        "═══════════════════════════════════════════════════════════\n"
        "TRANSCRIPT TO AUDIT:\n"
        "═══════════════════════════════════════════════════════════\n"
        f"{transcript}\n\n"
        "Return ONLY valid JSON. Include ALL mandatory fields."
    )


# ═══════════════════════════════════════════════════════════
# OPENROUTER PROVIDER
# ═══════════════════════════════════════════════════════════
async def _run_openrouter(prompt: str, api_key: str, model: str, base_url: str) -> dict[str, Any]:
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
            {"role": "system", "content": "You are a call quality auditor. Return ONLY valid JSON following the schema EXACTLY."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
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
def _mock_audit_response() -> dict[str, Any]:
    return {
        "total_score": 80,
        "percentage": 80,
        "ranking": "Good",
        "sections": {
            "opening": {"score": 18, "max_score": 20, "percentage": 90},
            "communication": {"score": 16, "max_score": 20, "percentage": 80},
            "probing_resolution": {"score": 12, "max_score": 15, "percentage": 80},
            "process_compliance": {"score": 19, "max_score": 25, "percentage": 76},
            "closure": {"score": 15, "max_score": 20, "percentage": 75},
        },
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
# NORMALIZE — with STRICT sale_category validation
# ═══════════════════════════════════════════════════════════
def _normalize_audit_json(audit_json: dict[str, Any]) -> dict[str, Any]:
    payload = normalize_section_scores(audit_json or {})
    total_score, percentage, derived_ranking, fatal_flag = derive_scoring(payload)

    payload["total_score"] = int(total_score) if float(total_score).is_integer() else total_score
    payload["percentage"] = int(percentage) if float(percentage).is_integer() else percentage
    payload["ranking"] = derived_ranking
    payload["fatal_flag"] = fatal_flag
    if "fatal" not in payload:
        payload["fatal"] = int(fatal_flag)
    payload.setdefault("areas_for_improvement", [])

    # ═══ STRICT RECOMPUTATION OF sale_category ═══
    call_connected = bool(payload.get("call_connected", False))
    purchase_discussed = bool(payload.get("purchase_discussed", False))
    intent_validated = bool(payload.get("intent_validated", False))
    confirmation_received = bool(payload.get("confirmation_received", False))
    required_info_collected = bool(payload.get("required_info_collected", False))
    order_after_confirmation = bool(payload.get("order_after_confirmation", False))

    # Force-correct sale_category based on boolean logic (override AI if wrong)
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
        # Determine reason
        if not confirmation_received:
            computed_reason = "Not Confirmed"
        elif not required_info_collected or not order_after_confirmation:
            computed_reason = "Without Information"
        elif not intent_validated:
            computed_reason = "Forcefully Placed"
        else:
            computed_reason = "Not Confirmed"

    # Use computed values (AI might have returned wrong)
    ai_category = payload.get("sale_category")
    if ai_category != computed_category:
        print(f"[ai_audit] ⚠️  Overriding AI sale_category '{ai_category}' → '{computed_category}'")

    payload["sale_category"] = computed_category
    payload["invalid_reason"] = computed_reason

    # Ensure defaults
    payload.setdefault("crm_sale_done", False)
    payload.setdefault("customer_confirmation", "Confirmed" if confirmation_received else "Not Confirmed")
    payload.setdefault("order_information",
                       "Complete" if required_info_collected else "Not Available")

    return payload


# ═══════════════════════════════════════════════════════════
# MAIN ENTRY
# ═══════════════════════════════════════════════════════════
async def run_ai_audit(prompt: str, transcript: str = "", voice_mail: bool = False) -> dict[str, Any]:
    if voice_mail:
        return {}
    template = (prompt or "").strip()
    if not template:
        raise RuntimeError("No client prompt configured for AI audit.")

    settings = get_settings()
    user_prompt = build_audit_prompt(template, transcript)

    # Priority 1: OpenRouter
    if settings.openrouter_api_key:
        try:
            print(f"[ai_audit] Trying OpenRouter ({settings.openrouter_model})...")
            raw = await _run_openrouter(
                user_prompt, settings.openrouter_api_key,
                settings.openrouter_model, settings.openrouter_base_url,
            )
            if raw:
                print(f"[ai_audit] ✅ OpenRouter returned {len(raw)} keys")
                return _normalize_audit_json(raw)
            print("[ai_audit] ⚠️  OpenRouter returned empty")
        except Exception as e:
            print(f"[ai_audit] ❌ OpenRouter failed: {e}")

    # Priority 2: Mock
    if settings.llm_mock_enabled:
        print("[ai_audit] Using MOCK response")
        return _normalize_audit_json(_mock_audit_response())

    raise RuntimeError("No LLM provider available. Set OPENROUTER_API_KEY or LLM_MOCK_ENABLED=true")