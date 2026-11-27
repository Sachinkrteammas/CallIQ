"""Shared helpers for deriving audit status and evaluation diagnostics.

Call Explorer and Call Details both need the same answer to:
- has this call been audited?
- what is its processing status?
- which fatal rules / critical parameters failed?

Keeping the logic here avoids the two endpoints drifting apart.
"""
import json
from typing import Any, Dict, List, Tuple

PLACEHOLDER_STATUSES = {
    "[RECORDING_MISSING]": "Recording Missing",
    "[NO_SPEECH]": "No Speech",
    "[TRANSCRIPT_FAILED]": "Transcript Failed",
}


def coerce_audit_json(raw: Any) -> Dict[str, Any]:
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
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _as_findings(value: Any) -> List[Dict[str, Any]]:
    if not value:
        return []
    if isinstance(value, list):
        return [v for v in value if v]
    if isinstance(value, dict):
        return [
            dict(v, name=k) if isinstance(v, dict) else {"name": k, "detail": v}
            for k, v in value.items() if v
        ]
    return [{"detail": str(value)}]


def audit_diagnostics(audit_json: Any) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Return (fatal_errors, critical_failures) from an audit payload."""
    data = coerce_audit_json(audit_json)
    fatal_errors: List[Dict[str, Any]] = []
    critical_failures: List[Dict[str, Any]] = []

    if data.get("fatal") or data.get("fatal_flag") or data.get("fatal_fail"):
        fatal_errors.append({
            "name": "Fatal rule failure",
            "detail": data.get("fatal_reason") or "Fatal rule triggered",
        })
    fatal_errors.extend(_as_findings(data.get("fatal_errors") or data.get("fatal_rules")))
    critical_failures.extend(_as_findings(
        data.get("hard_rule_failures")
        or data.get("critical_failures")
        or data.get("hardRules")
    ))

    behaviours = _as_findings(data.get("behaviours_detected"))
    critical_failures.extend([
        b for b in behaviours
        if isinstance(b, dict) and str(b.get("severity", "")).lower() == "critical"
    ])

    return fatal_errors, critical_failures


def call_status(has_audit: bool, transcript: Any = None) -> Tuple[str, str | None]:
    """Derive the audit status shown in Call Explorer / Call Details."""
    if has_audit:
        return "Completed", None
    value = str(transcript or "").strip()
    if value in PLACEHOLDER_STATUSES:
        status = PLACEHOLDER_STATUSES[value]
        return status, status
    if value:
        return "Awaiting Audit", None
    return "Pending", None


def has_audit_data(row: Dict[str, Any]) -> bool:
    raw = row.get("audit_json")
    return any(
        row.get(key) is not None
        for key in ("total_score", "percentage", "ranking")
    ) or raw not in (None, "", {}, "{}", "null")
