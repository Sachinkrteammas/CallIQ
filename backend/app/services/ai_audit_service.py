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


def build_audit_prompt(template: str, transcript: str) -> str:
    template = (template or "").strip()
    if not template:
        raise RuntimeError("No client prompt configured for AI audit. Add an active prompt in ai_prompts for this client.")
    transcript = (transcript or "").strip() or "[EMPTY TRANSCRIPT]"
    return (
        f"{template}\n\n"
        "Transcript to audit:\n"
        f"{transcript}\n\n"
        "Return ONLY valid JSON matching the schema defined in the prompt above. Nothing else."
    )


def _run_openai_chat_sync(prompt: str, transcript: str, api_key: str, model: str) -> dict[str, Any]:
    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "Return ONLY valid JSON"},
            {"role": "user", "content": f"{prompt}\n\nConversation:\n{transcript}"},
        ],
        temperature=0,
    )
    content = (response.choices[0].message.content or "").strip()
    return _extract_json(content)


def _mock_audit_response() -> dict[str, Any]:
    return {
        "total_score": 80,
        "percentage": 80,
        "call_category": "Inbound",
        "team": "Billing",
        "sections": {
            "opening": {"score": 18, "max_score": 20, "percentage": 90},
            "communication": {"score": 16, "max_score": 20, "percentage": 80},
            "probing_resolution": {"score": 12, "max_score": 15, "percentage": 80},
            "process_compliance": {"score": 19, "max_score": 25, "percentage": 76},
            "closure": {"score": 20, "max_score": 25, "percentage": 80},
        },
        "complaint_audit": {"request_raised": "yes", "request_classification": "Refund"},
        "conversion_audit": {"booking_done": "no"},
        "registration_evaluation": {"status": "Full Registration"},
        "sensitive_word": [],
        "fatal_flag": False,
        "hard_rule_failures": [],
        "behaviours_detected": [],
        "recommendations": ["Continue reinforcing active listening and clear next steps."],
        "areas_for_improvement": ["Slightly improve discovery probing on billing context."],
        "summary": "The agent handled the billing query professionally, verified the account, "
                   "applied the correct resolution and closed the call with clear next steps.",
    }


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
    return payload


async def run_ai_audit(prompt: str, transcript: str = "", voice_mail: bool = False) -> dict[str, Any]:
    if voice_mail:
        return {}

    template = (prompt or "").strip()
    if not template:
        raise RuntimeError("No client prompt configured for AI audit. Add an active prompt in ai_prompts for this client.")

    settings = get_settings()
    llm_url = (settings.llm_api_url or "").strip()
    openai_key = (settings.openai_api_key or "").strip()

    user_prompt = build_audit_prompt(template, transcript)
    raw: dict[str, Any] | None = None

    if llm_url and "example.com" not in llm_url:
        headers = {"Authorization": f"Bearer {settings.llm_api_key}"} if settings.llm_api_key else {}
        payload = {"prompt": template, "transcript": transcript}
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(llm_url, json=payload, headers=headers)
                response.raise_for_status()
            raw = response.json()
        except (httpx.HTTPError, ValueError):
            raw = None

    if raw is None and openai_key:
        raw = await asyncio.to_thread(_run_openai_chat_sync, user_prompt, transcript, openai_key, settings.openai_model)

    if raw is None and settings.llm_mock_enabled:
        raw = _mock_audit_response()

    if raw is None:
        raise RuntimeError(
            "LLM provider is not configured. Set OPENAI_API_KEY or LLM_API_URL in backend/.env, "
            "or set LLM_MOCK_ENABLED=true for mock mode."
        )

    if not raw:
        raw = _mock_audit_response() if settings.llm_mock_enabled else {}

    return _normalize_audit_json(raw)