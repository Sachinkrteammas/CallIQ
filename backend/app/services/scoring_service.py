from typing import Any

SECTION_WEIGHTS = {
    "opening": 15,
    "communication": 20,
    "probing_resolution": 15,
    "process_compliance": 25,
    "closure": 25,
}

RANKING_BANDS = (
    (85.0, "Excellent"),
    (70.0, "Good"),
    (50.0, "Average"),
    (0.0, "Poor"),
)


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _is_empty(value: Any) -> bool:
    return value is None or value == ""


def section_percentage(section: Any) -> float:
    if isinstance(section, (int, float)):
        return _clamp(_to_float(section))
    if not isinstance(section, dict):
        return 0.0
    pct = _to_float(section.get("percentage"))
    if 0 < pct <= 100:
        return _clamp(pct)
    score = _to_float(section.get("score"))
    max_score = _to_float(section.get("max_score"), 100.0)
    if max_score <= 0:
        max_score = 100.0
    return _clamp(score / max_score * 100)


def normalize_section_scores(audit_json: Any) -> dict[str, Any]:
    data = dict(audit_json or {})
    raw_sections = data.get("sections")
    if not isinstance(raw_sections, dict):
        raw_sections = {}

    sections: dict[str, dict[str, Any]] = {}
    for name, raw in raw_sections.items():
        if not isinstance(raw, dict):
            continue
        max_score = _to_float(raw.get("max_score"), 100.0)
        if max_score <= 0:
            max_score = 100.0
        score = _clamp(_to_float(raw.get("score")), 0.0, max_score)
        section: dict[str, Any] = {
            "score": round(score, 1),
            "max_score": max_score,
            "percentage": round(section_percentage(raw), 1),
        }
        if isinstance(raw.get("parameters"), dict):
            section["parameters"] = raw["parameters"]
        sections[name] = section

    data["sections"] = sections

    if not isinstance(data.get("parameter_scores"), list):
        data["parameter_scores"] = [
            {"param": name, "score": sections[name]["percentage"]}
            for name in sections
        ]
    return data


def _resolve_fatal(data: dict[str, Any]) -> bool:
    for key in ("fatal_flag", "fatal", "fatal_fail"):
        value = data.get(key)
        if value is not None:
            return bool(value)
    return bool(data.get("hard_rule_failures"))


def _provided_total(data: dict[str, Any]) -> float | None:
    for key in ("total_score", "overall_score", "percentage"):
        value = data.get(key)
        if not _is_empty(value):
            return _to_float(value)
    return None


def weighted_total(sections: dict[str, Any]) -> float:
    total_weight = sum(SECTION_WEIGHTS.values()) or 1
    acc = 0.0
    for name, weight in SECTION_WEIGHTS.items():
        sec = sections.get(name)
        if sec is not None:
            acc += section_percentage(sec) * weight
    return _clamp(acc / total_weight)


def ranking_for(score: float) -> str:
    for threshold, label in RANKING_BANDS:
        if score >= threshold:
            return label
    return "Poor"


def derive_scoring(audit_json: Any) -> tuple[int, int, str, bool]:
    data = normalize_section_scores(audit_json)
    sections = data.get("sections") or {}
    provided = _provided_total(data)
    total = provided if provided is not None else weighted_total(sections)
    total = round(_clamp(total), 1)

    total_score = int(round(total))
    percentage = int(round(total))
    fatal_flag = _resolve_fatal(data)
    return total_score, percentage, ranking_for(total), fatal_flag