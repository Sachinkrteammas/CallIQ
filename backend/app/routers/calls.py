import random
from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from .. import data

router = APIRouter(prefix="/api/calls", tags=["calls"])


@router.get("")
def list_calls(
    q: Optional[str] = None,
    team: Optional[str] = None,
    project: Optional[str] = None,
    queue: Optional[str] = None,
    agent_id: Optional[str] = None,
    severity: Optional[str] = None,
    critical_only: bool = False,
    escalated_only: bool = False,
    dead_air_only: bool = False,
    tag: Optional[str] = None,
    page: int = 1,
    page_size: int = 15,
):
    results = data.CALLS
    if q:
        ql = q.lower()
        results = [c for c in results if ql in c["id"].lower() or ql in c["agent_name"].lower()
                   or ql in c["customer"].lower() or ql in c["phone"].lower()]
    if team:
        results = [c for c in results if c["team"] == team]
    if project:
        results = [c for c in results if c["project"] == project]
    if queue:
        results = [c for c in results if c["queue"] == queue]
    if agent_id:
        results = [c for c in results if c["agent_id"] == agent_id]
    if severity:
        results = [c for c in results if c["risk"] == severity]
    if critical_only:
        results = [c for c in results if c["critical"]]
    if escalated_only:
        results = [c for c in results if c["escalated"]]
    if dead_air_only:
        results = [c for c in results if c["dead_air_pct"] > 10]
    if tag == "abusive":
        results = [c for c in results if c["abusive"]]
    if tag == "interruptions":
        results = [c for c in results if c["interruptions"] >= 4]

    total = len(results)
    start = (page - 1) * page_size
    page_items = results[start:start + page_size]
    return {"items": page_items, "total": total, "page": page, "page_size": page_size}


def _build_detail(call):
    random.seed(hash(call["id"]) % (2**31))
    timeline = []
    for t, label, level in data.TIMELINE_TEMPLATE:
        timeline.append({"time": t, "label": label, "level": level})

    transcript = []
    t_sec = 0
    for speaker, line in data.TRANSCRIPT_LINES:
        t_sec += random.randint(20, 55)
        mm, ss = divmod(t_sec, 60)
        transcript.append({
            "speaker": speaker,
            "time": f"{mm}:{ss:02d}",
            "text": line.format(agent=call["agent_name"].split()[0]),
            "emotion": random.choice(["neutral", "positive", "negative", "frustrated"]),
        })

    scores = {
        "overall": call["conversation_score"],
        "professionalism": round(random.uniform(50, 98), 1),
        "empathy": round(random.uniform(40, 95), 1),
        "listening": round(random.uniform(45, 97), 1),
        "confidence": round(random.uniform(50, 96), 1),
        "compliance": call["compliance_score"],
        "patience": round(random.uniform(40, 95), 1),
        "resolution": round(random.uniform(45, 98), 1),
        "control": round(random.uniform(40, 96), 1),
    }

    behaviours = []
    pool = [
        ("Dead Air Detected", "amber"), ("Long Hold", "amber"), ("Multiple Interruptions", "amber"),
        ("Agent Overtalking", "amber"), ("Customer Frustrated", "red"), ("Script Deviation", "amber"),
        ("Missing Disclaimer", "red"), ("Abusive Language", "red"), ("Threat Detected", "red"),
    ]
    sample_n = 6 if call["critical"] else 3
    for label, level in random.sample(pool, k=sample_n):
        behaviours.append({
            "label": label,
            "confidence": round(random.uniform(72, 99), 1),
            "timestamp": f"{random.randint(0,9)}:{random.randint(10,59)}",
            "severity": "Critical" if level == "red" else "Medium",
        })

    emotion_journey = []
    mood = 0.5
    for i in range(10):
        mood += random.uniform(-0.25, 0.2)
        mood = max(0, min(1, mood))
        emotion_journey.append({"t": i, "customer": round(mood, 2),
                                 "agent": round(min(1, max(0, mood + random.uniform(-0.1, 0.2))), 2)})

    return {
        **call,
        "timeline": timeline,
        "transcript": transcript,
        "scores": scores,
        "behaviours": behaviours,
        "emotion_journey": emotion_journey,
    }


@router.get("/{call_id}")
def get_call(call_id: str):
    call = next((c for c in data.CALLS if c["id"] == call_id), None)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    return _build_detail(call)
