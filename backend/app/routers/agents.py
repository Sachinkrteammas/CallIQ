import random
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from .. import data
from ..routers.auth import get_current_user

router = APIRouter(prefix="/api/agents", tags=["agents"])

COACHING_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS coaching_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agent_id VARCHAR(20) NOT NULL,
    agent_name VARCHAR(255) NOT NULL,
    team VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Needs Coaching',
    recommendation TEXT,
    estimated_improvement VARCHAR(255),
    evidence TEXT,
    score_at_flag DECIMAL(5,1),
    reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

_COACHING_READY = False


def _ensure_coaching_table(db: Session):
    global _COACHING_READY
    if _COACHING_READY:
        return
    db.execute(text(COACHING_TABLE_SQL))
    db.commit()
    count = db.execute(text("SELECT COUNT(*) FROM coaching_queue")).scalar()
    if count == 0:
        seed = [
            ("AV", "Amit Verma", "Delta", "Needs Coaching",
             "De-escalation techniques and active listening. Agent displayed defensive behavior in 4/5 reviewed calls.",
             "+15% score", "CL-60782, CL-60688", 54.0, "Low avg_score + critical incidents"),
            ("RP", "Ravi Patel", "Delta", "Needs Coaching",
             "Script adherence and compliance. Missing mandatory disclaimers in 60% of calls.",
             "+20% compliance", "CL-60654, CL-60521", 48.0, "Lowest compliance score"),
            ("AS", "Ankit Sharma", "Delta", "Assigned",
             "Empathy and customer experience. Customer satisfaction scores consistently below 40%.",
             "+12% CSAT", "CL-60498", 62.0, "Low avg_score + negative trend"),
            ("SK", "Suresh Kumar", "Beta", "Needs Coaching",
             "Dead air management. Average dead air per call at 4.2s vs team avg of 1.8s.",
             "+8% score", "CL-60580", 72.0, "High dead air percentage"),
            ("VS", "Vikram Singh", "Epsilon", "Assigned",
             "Hold time optimization. Hold episodes exceeding 60s in 30% of calls.",
             "+6% AHT", "CL-60567", 71.0, "Long hold times"),
            ("DJ", "Deepa Joshi", "Beta", "Completed",
             "Script adherence completed. Score improved from 71% to 76%.",
             "+5% achieved", "CL-60445", 76.0, "Improvement confirmed"),
            ("PS", "Priya Sharma", "Alpha", "Completed",
             "Advanced de-escalation workshop completed. Certification earned.",
             "Maintained 88%", "N/A", 88.0, "Maintained high score"),
            ("AV", "Amit Verma", "Delta", "Escalated",
             "Multiple coaching sessions completed without improvement. Requires management intervention.",
             "HR review pending", "CL-60782, CL-60688, CL-60654", 54.0, "No improvement after coaching"),
        ]
        for s in seed:
            db.execute(text("""
                INSERT INTO coaching_queue (agent_id, agent_name, team, status, recommendation,
                    estimated_improvement, evidence, score_at_flag, reason)
                VALUES (:aid, :an, :tm, :st, :rec, :ei, :ev, :sc, :re)
            """), {"aid": s[0], "an": s[1], "tm": s[2], "st": s[3], "rec": s[4],
                   "ei": s[5], "ev": s[6], "sc": s[7], "re": s[8]})
        db.commit()
    _COACHING_READY = True


# ─── Agent list (still from in-memory data.py for now) ─────────────────

@router.get("")
def list_agents():
    return data.AGENTS


@router.get("/team-health")
def team_health():
    random.seed(31)
    teams = {}
    for a in data.AGENTS:
        teams.setdefault(a["team"], []).append(a)
    best = max(teams.items(), key=lambda kv: sum(x["avg_score"] for x in kv[1]) / len(kv[1]))
    worst = min(teams.items(), key=lambda kv: sum(x["avg_score"] for x in kv[1]) / len(kv[1]))
    most_improved = max(teams.items(), key=lambda kv: sum(x["trend"] for x in kv[1]))
    highest_risk = max(teams.items(), key=lambda kv: sum(1 for x in kv[1] if x["risk"] in ("High", "Critical")))
    return [
        {"title": "Most Improved Team", "team": most_improved[0], "value": f"+{round(sum(x['trend'] for x in most_improved[1])/len(most_improved[1]),1)}%"},
        {"title": "Highest Risk Team", "team": highest_risk[0], "value": f"{sum(1 for x in highest_risk[1] if x['risk'] in ('High','Critical'))} agents"},
        {"title": "Most Escalations", "team": random.choice(data.TEAMS), "value": f"{random.randint(12,40)} calls"},
        {"title": "Highest Hold Time", "team": random.choice(data.TEAMS), "value": f"{random.randint(3,6)}.{random.randint(0,9)} min"},
        {"title": "Lowest Greeting Score", "team": random.choice(data.TEAMS), "value": f"{random.randint(58,74)}%"},
        {"title": "Best Performing Team", "team": best[0], "value": f"{round(sum(x['avg_score'] for x in best[1])/len(best[1]),1)}%"},
    ]


# ─── Coaching CRUD (DB) ─────────────────────────────────────────────────

@router.get("/coaching")
def coaching_list(user=Depends(get_current_user), db: Session = Depends(get_db)):
    _ensure_coaching_table(db)
    rows = db.execute(text("SELECT * FROM coaching_queue ORDER BY created_at DESC")).fetchall()
    items = []
    for r in rows:
        m = r._mapping
        items.append({
            "id": m["id"],
            "agent_id": m["agent_id"],
            "agent_name": m["agent_name"],
            "team": m["team"],
            "status": m["status"],
            "recommendation": m["recommendation"],
            "estimated_improvement": m["estimated_improvement"],
            "evidence": m["evidence"],
            "score_at_flag": float(m["score_at_flag"]) if m["score_at_flag"] else None,
            "reason": m["reason"],
            "created_at": str(m["created_at"]) if m["created_at"] else None,
        })
    return items


class CoachingCreate(BaseModel):
    agent_id: str
    agent_name: str
    team: str = ""
    recommendation: str = ""
    estimated_improvement: str = ""
    evidence: str = ""
    reason: str = ""


@router.post("/coaching")
def coaching_create(req: CoachingCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    _ensure_coaching_table(db)
    agent = next((a for a in data.AGENTS if a["id"] == req.agent_id), None)
    score = agent["avg_score"] if agent else None
    team = req.team or (agent["team"] if agent else "")

    db.execute(text("""
        INSERT INTO coaching_queue (agent_id, agent_name, team, status, recommendation,
            estimated_improvement, evidence, score_at_flag, reason)
        VALUES (:aid, :an, :tm, 'Needs Coaching', :rec, :ei, :ev, :sc, :re)
    """), {
        "aid": req.agent_id, "an": req.agent_name, "tm": team,
        "rec": req.recommendation, "ei": req.estimated_improvement,
        "ev": req.evidence, "sc": score, "re": req.reason,
    })
    db.commit()
    new_id = db.execute(text("SELECT id FROM coaching_queue WHERE agent_id = :aid AND agent_name = :an ORDER BY id DESC LIMIT 1"), {"aid": req.agent_id, "an": req.agent_name}).scalar()
    return {"id": new_id, "message": "Coaching item created"}


class CoachingUpdate(BaseModel):
    status: Optional[str] = None
    recommendation: Optional[str] = None
    estimated_improvement: Optional[str] = None


@router.put("/coaching/{item_id}")
def coaching_update(item_id: int, req: CoachingUpdate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    _ensure_coaching_table(db)
    existing = db.execute(text("SELECT id FROM coaching_queue WHERE id = :id"), {"id": item_id}).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Coaching item not found")
    fields = []
    vals = {"id": item_id}
    if req.status is not None:
        fields.append("status = :st")
        vals["st"] = req.status
    if req.recommendation is not None:
        fields.append("recommendation = :rec")
        vals["rec"] = req.recommendation
    if req.estimated_improvement is not None:
        fields.append("estimated_improvement = :ei")
        vals["ei"] = req.estimated_improvement
    if fields:
        db.execute(text(f"UPDATE coaching_queue SET {', '.join(fields)} WHERE id = :id"), vals)
        db.commit()
    return {"message": "Coaching item updated"}


@router.delete("/coaching/{item_id}")
def coaching_delete(item_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    _ensure_coaching_table(db)
    existing = db.execute(text("SELECT id FROM coaching_queue WHERE id = :id"), {"id": item_id}).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Coaching item not found")
    db.execute(text("DELETE FROM coaching_queue WHERE id = :id"), {"id": item_id})
    db.commit()
    return {"message": "Coaching item deleted"}


# ─── Auto-flag agents based on scores ───────────────────────────────────

SCORE_THRESHOLD = 70.0
CRITICAL_INCIDENT_THRESHOLD = 2


@router.post("/coaching/auto-flag")
def auto_flag_agents(user=Depends(get_current_user), db: Session = Depends(get_db)):
    _ensure_coaching_table(db)

    existing_rows = db.execute(
        text("SELECT agent_id, status FROM coaching_queue WHERE status IN ('Needs Coaching', 'Assigned', 'Escalated')")
    ).fetchall()
    existing_active = {}
    for r in existing_rows:
        m = r._mapping
        existing_active.setdefault(m["agent_id"], []).append(m["status"])

    flagged = []
    for agent in data.AGENTS:
        aid = agent["id"]
        avg = agent["avg_score"]
        risk = agent["risk"]
        coaching_count = agent.get("coaching_assigned", 0)

        reasons = []
        if avg < SCORE_THRESHOLD:
            reasons.append(f"avg_score {avg} < {SCORE_THRESHOLD}")
        if risk in ("High", "Critical"):
            reasons.append(f"risk level {risk}")
        if agent["trend"] < -5:
            reasons.append(f"negative trend {agent['trend']}%")
        if agent.get("compliance", 100) < 70:
            reasons.append(f"low compliance {agent['compliance']}%")

        critical_calls = sum(
            1 for c in data.CALLS
            if c["agent_id"] == aid and c.get("critical", False)
        )
        if critical_calls >= CRITICAL_INCIDENT_THRESHOLD:
            reasons.append(f"{critical_calls} critical incidents")

        if not reasons:
            continue

        already_active = aid in existing_active
        if already_active:
            continue

        recommendation = _build_recommendation(agent, reasons)
        improvement = _estimate_improvement(agent)

        db.execute(text("""
            INSERT INTO coaching_queue (agent_id, agent_name, team, status, recommendation,
                estimated_improvement, evidence, score_at_flag, reason)
            VALUES (:aid, :an, :tm, 'Needs Coaching', :rec, :ei, :ev, :sc, :re)
        """), {
            "aid": aid,
            "an": agent["name"],
            "tm": agent["team"],
            "rec": recommendation,
            "ei": improvement,
            "ev": f"{critical_calls} critical calls" if critical_calls else "",
            "sc": avg,
            "re": "; ".join(reasons),
        })
        flagged.append({"agent_id": aid, "name": agent["name"], "score": avg, "reasons": reasons})

    db.commit()
    return {"flagged": flagged, "count": len(flagged)}


def _build_recommendation(agent, reasons):
    parts = []
    if agent["avg_score"] < SCORE_THRESHOLD:
        parts.append(f"Overall performance score ({agent['avg_score']}) is below threshold ({SCORE_THRESHOLD}). Focus on core skills improvement.")
    if agent["risk"] in ("High", "Critical"):
        parts.append(f"Risk level is {agent['risk']}. Review recent call quality and compliance.")
    if agent["trend"] < -5:
        parts.append(f"Performance trending downward ({agent['trend']}%). Identify root cause and intervene.")
    if agent.get("compliance", 100) < 70:
        parts.append(f"Compliance score ({agent['compliance']}%) needs improvement. Schedule compliance refresher.")
    return " ".join(parts) if parts else "General coaching recommended based on performance metrics."


def _estimate_improvement(agent):
    gap = SCORE_THRESHOLD - agent["avg_score"]
    if gap > 15:
        return f"+{round(gap * 0.6, 0):.0f}% score potential"
    elif gap > 5:
        return f"+{round(gap * 0.5, 0):.0f}% score improvement"
    else:
        return "+5% score improvement"


# ─── Single agent detail (must be LAST so it doesn't shadow static routes) ─

@router.get("/{agent_id}")
def get_agent(agent_id: str):
    agent = next((a for a in data.AGENTS if a["id"] == agent_id), None)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    calls = [c for c in data.CALLS if c["agent_id"] == agent_id]
    return {**agent, "recent_calls": calls[:10]}
