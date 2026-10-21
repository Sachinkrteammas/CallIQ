from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from .. import data

router = APIRouter(prefix="/api/agents", tags=["agents"])

QUALITY_PARAMS = [
    "opening", "customer_understanding", "resolution_quality",
    "communication", "call_control", "process_adherence", "closing",
]
PARAM_LABELS = {
    "opening": "Opening",
    "customer_understanding": "Customer Understanding",
    "resolution_quality": "Resolution Quality",
    "communication": "Communication",
    "call_control": "Call Control",
    "process_adherence": "Process Adherence",
    "closing": "Closing",
}


def _rag(pct):
    if pct >= 80: return "green"
    if pct >= 60: return "amber"
    return "red"


# ═══════════════════════════════════════════════════════════
# Pydantic models for coaching CRUD
# ═══════════════════════════════════════════════════════════
class CoachingUpdate(BaseModel):
    status: Optional[str] = None
    recommendation: Optional[str] = None
    estimated_improvement: Optional[str] = None
    reason: Optional[str] = None
    team: Optional[str] = None


class CoachingCreate(BaseModel):
    agent_id: str
    agent_name: str
    team: Optional[str] = "General"
    recommendation: Optional[str] = ""
    estimated_improvement: Optional[str] = ""
    reason: Optional[str] = ""
    status: Optional[str] = "Needs Coaching"


# In-memory coaching store (seeded from GET /coaching)
_COACHING_STORE: dict = {}


# ═══════════════════════════════════════════════════════════
# 1. LIST AGENTS (with filters)  →  /api/agents
# ═══════════════════════════════════════════════════════════
@router.get("")
def list_agents(
    client_id: Optional[int] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    where = ["ca.agent_id IS NOT NULL"]
    params = {}
    if client_id:
        where.append("ca.client_id = :client_id")
        params["client_id"] = client_id
    if q:
        where.append("ca.agent_id LIKE :q")
        params["q"] = f"%{q}%"
    wc = " AND ".join(where)

    try:
        rows = db.execute(text(f"""
            SELECT ca.agent_id,
                   COUNT(*) AS total_audits,
                   AVG(ca.total_score) AS avg_score,
                   AVG(ca.percentage) AS avg_pct,
                   SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count,
                   SUM(CASE WHEN ca.sale_category = 'Genuine' THEN 1 ELSE 0 END) AS genuine_count,
                   SUM(CASE WHEN ca.sale_category = 'Invalid' THEN 1 ELSE 0 END) AS invalid_count
            FROM call_audits ca
            WHERE {wc}
            GROUP BY ca.agent_id
            ORDER BY avg_pct DESC
        """), params).mappings().all()
    except Exception as e:
        print(f"[agents] DB failed: {e}")
        rows = []

    if not rows:
        import random
        random.seed(42)
        rows = []
        for a in data.AGENTS:
            sc = random.uniform(55, 92)
            rows.append({
                "agent_id": a["id"],
                "total_audits": random.randint(10, 80),
                "avg_score": round(sc, 1),
                "avg_pct": round(sc, 1),
                "fatal_count": random.randint(0, 3),
                "genuine_count": random.randint(5, 40),
                "invalid_count": random.randint(2, 20),
            })

    agents = []
    for r in rows:
        pct = float(r["avg_pct"] or 0)
        total = int(r["total_audits"] or 0)
        genuine = int(r["genuine_count"] or 0)
        agents.append({
            "agent_id": r["agent_id"],
            "total_audits": total,
            "avg_score": round(float(r["avg_score"] or 0), 1),
            "percentage": round(pct, 1),
            "color": _rag(pct),
            "fatal_count": int(r["fatal_count"] or 0),
            "genuine_count": genuine,
            "invalid_count": int(r["invalid_count"] or 0),
            "fcr_percentage": round((genuine / total) * 100, 1) if total else 0,
        })
    return {"agents": agents, "total": len(agents)}


# ═══════════════════════════════════════════════════════════
# 2. SIMPLE LIST  →  /api/agents/list
# ═══════════════════════════════════════════════════════════
@router.get("/list")
def list_agents_simple(
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    params = {}
    where = ["ca.agent_id IS NOT NULL"]
    if client_id:
        where.append("ca.client_id = :client_id")
        params["client_id"] = client_id
    wc = " AND ".join(where)

    try:
        rows = db.execute(text(f"""
            SELECT DISTINCT ca.agent_id
            FROM call_audits ca WHERE {wc}
            ORDER BY ca.agent_id
        """), params).scalars().all()
    except Exception:
        rows = []

    if not rows:
        rows = [a["id"] for a in data.AGENTS]

    return {"agents": [{"agent_id": r} for r in rows]}


# ═══════════════════════════════════════════════════════════
# Helper: build coaching queue list (used by GET + seeding)
# ═══════════════════════════════════════════════════════════
def _build_coaching_queue(client_id: Optional[int] = None, db: Session = None):
    where = ["ca.agent_id IS NOT NULL"]
    params = {}
    if client_id:
        where.append("ca.client_id = :client_id")
        params["client_id"] = client_id
    wc = " AND ".join(where)

    try:
        rows = db.execute(text(f"""
            SELECT ca.agent_id,
                   COUNT(*) AS total_audits,
                   AVG(ca.percentage) AS avg_pct,
                   SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count
            FROM call_audits ca
            WHERE {wc}
            GROUP BY ca.agent_id
            ORDER BY avg_pct ASC
            LIMIT 50
        """), params).mappings().all()
    except Exception:
        rows = []

    # Fallback mock if DB empty
    if not rows:
        import random
        random.seed(42)
        for a in data.AGENTS[:12]:
            sc = random.uniform(45, 85)
            rows.append({
                "agent_id": a["id"],
                "total_audits": random.randint(10, 60),
                "avg_pct": round(sc, 1),
                "fatal_count": random.randint(0, 2),
            })

    import random
    result = []
    for r in rows:
        pct = float(r["avg_pct"] or 0)
        total = int(r["total_audits"] or 0)
        fatal = int(r["fatal_count"] or 0)

        # Skip good performers
        if pct >= 80 and fatal == 0:
            continue

        status = "Needs Coaching" if fatal > 0 or pct < 65 else "Assigned"
        random.seed(hash(r["agent_id"]) % (2**31))
        result.append({
            "id": r["agent_id"],
            "agent_id": r["agent_id"],
            "agent_name": r["agent_id"],
            "team": "General",
            "status": status,
            "recommendation": random.choice([
                "Needs coaching on empathy & tone",
                "Improve call control & hold management",
                "Script adherence needs attention",
                "Strengthen discovery probing questions",
                "Reduce interruptions & overtalking",
            ]),
            "estimated_improvement": f"+{random.randint(5, 15)}%",
            "score_at_flag": round(pct, 1),
            "reason": f"Avg score {pct:.1f}%, {fatal} fatal flag(s)",
            "evidence": f"{total} audits reviewed",
        })
    return result


def _seed_coaching_store(db: Session = None):
    """Seed in-memory store once so Advance/Delete work on existing items."""
    global _COACHING_STORE
    if _COACHING_STORE:
        return
    try:
        if db is None:
            db = next(get_db())
        items = _build_coaching_queue(db=db)
    except Exception:
        items = []
    for it in items:
        _COACHING_STORE[it["id"]] = it


# ═══════════════════════════════════════════════════════════
# 3. COACHING QUEUE  →  GET /api/agents/coaching
#    (MUST be before /{agent_id} route)
# ═══════════════════════════════════════════════════════════
@router.get("/coaching")
def coaching_queue(
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Returns an ARRAY of coaching items for the Coaching Center page.
    """
    items = _build_coaching_queue(client_id=client_id, db=db)

    # Merge in-memory store overrides (status changes from Advance, etc.)
    if _COACHING_STORE:
        seen = set()
        merged = []
        for it in items:
            store_item = _COACHING_STORE.get(it["id"])
            if store_item:
                merged.append({**it, **store_item})
            else:
                merged.append(it)
            seen.add(it["id"])
        # Include items added manually via POST
        for key, val in _COACHING_STORE.items():
            if key not in seen:
                merged.append(val)
        return merged

    # First call: seed store so updates/deletes have something to act on
    for it in items:
        _COACHING_STORE[it["id"]] = it
    return items


# ═══════════════════════════════════════════════════════════
# 4. COACHING CRUD  →  POST / PUT / DELETE / auto-flag
#    (MUST be before /coaching/{item_id} catch-all routes)
# ═══════════════════════════════════════════════════════════

@router.post("/coaching")
def create_coaching_item(payload: CoachingCreate):
    _seed_coaching_store()
    item_id = payload.agent_id
    item = {
        "id": item_id,
        "agent_id": payload.agent_id,
        "agent_name": payload.agent_name,
        "team": payload.team or "General",
        "status": payload.status or "Needs Coaching",
        "recommendation": payload.recommendation or "",
        "estimated_improvement": payload.estimated_improvement or "",
        "reason": payload.reason or "",
        "score_at_flag": None,
        "evidence": None,
    }
    _COACHING_STORE[item_id] = item
    return item


@router.post("/coaching/auto-flag")
def auto_flag_coaching(
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    items = _build_coaching_queue(client_id=client_id, db=db)
    flagged = []
    for it in items:
        # If it isn't in store yet, add it
        if it["id"] not in _COACHING_STORE:
            _COACHING_STORE[it["id"]] = it
            flagged.append({
                "agent_id": it["agent_id"],
                "name": it["agent_name"],
                "score": it["score_at_flag"],
                "reasons": [it["reason"]],
            })
    return {"count": len(flagged), "flagged": flagged}


@router.put("/coaching/{item_id}")
def update_coaching_item(item_id: str, payload: CoachingUpdate):
    _seed_coaching_store()

    if item_id not in _COACHING_STORE:
        # Allow creating a stub if unknown id came in (e.g. new agent)
        _COACHING_STORE[item_id] = {
            "id": item_id,
            "agent_id": item_id,
            "agent_name": item_id,
            "team": "General",
            "status": "Needs Coaching",
            "recommendation": "",
            "estimated_improvement": "",
            "reason": "",
            "score_at_flag": None,
            "evidence": None,
        }

    item = _COACHING_STORE[item_id]
    for k, v in payload.dict(exclude_unset=True).items():
        if v is not None:
            item[k] = v
    return item


@router.delete("/coaching/{item_id}")
def delete_coaching_item(item_id: str):
    _seed_coaching_store()
    removed = _COACHING_STORE.pop(item_id, None)
    return {"deleted": bool(removed), "id": item_id}


# ═══════════════════════════════════════════════════════════
# 5. ALL COACHING  →  /api/agents/coaching/all
# ═══════════════════════════════════════════════════════════
@router.get("/coaching/all")
def all_coaching(
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    where = ["ca.agent_id IS NOT NULL"]
    params = {}
    if client_id:
        where.append("ca.client_id = :client_id")
        params["client_id"] = client_id
    wc = " AND ".join(where)

    try:
        agents = db.execute(text(f"""
            SELECT DISTINCT ca.agent_id
            FROM call_audits ca WHERE {wc}
            ORDER BY ca.agent_id LIMIT 20
        """), params).scalars().all()
    except Exception:
        agents = []

    if not agents:
        agents = [a["id"] for a in data.AGENTS[:10]]

    import random
    result = []
    for a in agents:
        random.seed(hash(a) % (2**31))
        result.append({
            "agent_id": a,
            "recommendation": random.choice([
                "Needs coaching on empathy & tone",
                "Improve call control & hold management",
                "Script adherence needs attention",
                "Strengthen discovery probing questions",
                "Reduce interruptions & overtalking",
            ]),
            "priority": random.choice(["High", "Medium", "Low"]),
            "estimated_improvement": f"+{random.randint(5, 15)}%",
        })
    return {"coaching": result}


# ═══════════════════════════════════════════════════════════
# 6. AGENT COMPARISON  →  /api/agents/comparison
# ═══════════════════════════════════════════════════════════
@router.get("/comparison")
def agent_comparison(
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    where = ["ca.agent_id IS NOT NULL"]
    params = {}
    if client_id:
        where.append("ca.client_id = :client_id")
        params["client_id"] = client_id
    if from_date:
        where.append("ca.created_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append("ca.created_at <= :to_date")
        params["to_date"] = to_date + " 23:59:59"
    wc = " AND ".join(where)

    try:
        rows = db.execute(text(f"""
            SELECT ca.agent_id, ca.audit_json
            FROM call_audits ca WHERE {wc}
        """), params).mappings().all()
    except Exception:
        rows = []

    import json
    agent_data = {}
    for r in rows:
        a = r["agent_id"]
        j = r["audit_json"] if isinstance(r["audit_json"], dict) else {}
        if isinstance(r["audit_json"], str):
            try:
                j = json.loads(r["audit_json"])
            except Exception:
                j = {}
        sections = j.get("sections") or {}
        if a not in agent_data:
            agent_data[a] = {p: {"score": 0, "max": 0} for p in QUALITY_PARAMS}
        for p in QUALITY_PARAMS:
            s = sections.get(p) or {}
            if s:
                agent_data[a][p]["score"] += s.get("score", 0)
                agent_data[a][p]["max"] += s.get("max_score", 0) or s.get("max", 0)

    result = []
    for a, params_data in agent_data.items():
        row = {"agent_id": a, "parameters": {}}
        for p in QUALITY_PARAMS:
            t = params_data[p]
            pct = round((t["score"] / t["max"]) * 100, 1) if t["max"] else 0
            row["parameters"][p] = {"percentage": pct, "color": _rag(pct)}
        result.append(row)

    if not result:
        import random
        random.seed(42)
        for a in data.AGENTS[:10]:
            row = {"agent_id": a["id"], "parameters": {}}
            for p in QUALITY_PARAMS:
                pct = round(random.uniform(55, 92), 1)
                row["parameters"][p] = {"percentage": pct, "color": _rag(pct)}
            result.append(row)

    return {
        "comparison": result,
        "parameters": [{"key": p, "label": PARAM_LABELS[p]} for p in QUALITY_PARAMS],
    }


# ═══════════════════════════════════════════════════════════
# 7. DYNAMIC ROUTES — keep AFTER all static routes
# ═══════════════════════════════════════════════════════════

@router.get("/{agent_id}/score-by-parameter")
def agent_score_by_parameter(
    agent_id: str,
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    where = ["ca.agent_id = :agent_id"]
    params = {"agent_id": agent_id}
    if client_id:
        where.append("ca.client_id = :client_id")
        params["client_id"] = client_id
    if from_date:
        where.append("ca.created_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append("ca.created_at <= :to_date")
        params["to_date"] = to_date + " 23:59:59"
    wc = " AND ".join(where)

    try:
        rows = db.execute(text(f"SELECT ca.audit_json FROM call_audits ca WHERE {wc}"), params).scalars().all()
    except Exception:
        rows = []

    param_totals = {p: {"score": 0, "max": 0} for p in QUALITY_PARAMS}
    import json
    for row in rows:
        j = row if isinstance(row, dict) else {}
        if isinstance(row, str):
            try:
                j = json.loads(row)
            except Exception:
                j = {}
        sections = j.get("sections") or {}
        for p in QUALITY_PARAMS:
            s = sections.get(p) or {}
            if s:
                param_totals[p]["score"] += s.get("score", 0)
                param_totals[p]["max"] += s.get("max_score", 0) or s.get("max", 0)

    result = []
    for p in QUALITY_PARAMS:
        t = param_totals[p]
        pct = round((t["score"] / t["max"]) * 100, 1) if t["max"] else 0
        result.append({
            "key": p, "label": PARAM_LABELS[p],
            "percentage": pct, "color": _rag(pct),
        })

    if not any(r["percentage"] > 0 for r in result):
        import random
        random.seed(hash(agent_id) % (2**31))
        for r in result:
            r["percentage"] = round(random.uniform(55, 95), 1)
            r["color"] = _rag(r["percentage"])

    return {"agent_id": agent_id, "parameters": result}


@router.get("/{agent_id}/sub-parameter-drilldown")
def sub_parameter_drilldown(
    agent_id: str,
    db: Session = Depends(get_db),
):
    import random
    random.seed(hash(agent_id) % (2**31))

    sub_params = [
        {"param": "opening", "sub": "Greeting", "pct": round(random.uniform(60, 95), 1)},
        {"param": "opening", "sub": "Introduction", "pct": round(random.uniform(60, 95), 1)},
        {"param": "customer_understanding", "sub": "Probing", "pct": round(random.uniform(60, 95), 1)},
        {"param": "customer_understanding", "sub": "Active Listening", "pct": round(random.uniform(60, 95), 1)},
        {"param": "resolution_quality", "sub": "Solution Accuracy", "pct": round(random.uniform(60, 95), 1)},
        {"param": "resolution_quality", "sub": "Completeness", "pct": round(random.uniform(60, 95), 1)},
        {"param": "communication", "sub": "Clarity", "pct": round(random.uniform(60, 95), 1)},
        {"param": "communication", "sub": "Tone", "pct": round(random.uniform(60, 95), 1)},
        {"param": "call_control", "sub": "Hold Management", "pct": round(random.uniform(60, 95), 1)},
        {"param": "call_control", "sub": "Dead Air", "pct": round(random.uniform(60, 95), 1)},
        {"param": "process_adherence", "sub": "Script Compliance", "pct": round(random.uniform(60, 95), 1)},
        {"param": "process_adherence", "sub": "Documentation", "pct": round(random.uniform(60, 95), 1)},
        {"param": "closing", "sub": "Summary", "pct": round(random.uniform(60, 95), 1)},
        {"param": "closing", "sub": "Next Steps", "pct": round(random.uniform(60, 95), 1)},
    ]
    for s in sub_params:
        s["color"] = _rag(s["pct"])
    return {"agent_id": agent_id, "sub_parameters": sub_params}


@router.get("/{agent_id}/coaching")
def agent_coaching(
    agent_id: str,
    db: Session = Depends(get_db),
):
    import random
    random.seed(hash(agent_id) % (2**31))
    recommendations = [
        "Focus on active listening — customer interruptions are frequent.",
        "Improve empathy tone during escalations.",
        "Ensure compliance disclaimer is delivered before call closure.",
        "Reduce dead air by summarizing customer issue early.",
        "Strengthen probing questions to understand root cause.",
    ]
    selected = random.sample(recommendations, k=min(3, len(recommendations)))
    return {
        "agent_id": agent_id,
        "recommendations": selected,
        "estimated_improvement": f"+{random.randint(5, 18)}%",
    }


# ═══════════════════════════════════════════════════════════
# 8. AGENT DETAIL — MUST BE LAST (catch-all dynamic)
# ═══════════════════════════════════════════════════════════
@router.get("/{agent_id}")
def get_agent(
    agent_id: str,
    db: Session = Depends(get_db),
):
    try:
        row = db.execute(text("""
            SELECT COUNT(*) AS total_audits,
                   AVG(ca.total_score) AS avg_score,
                   AVG(ca.percentage) AS avg_pct,
                   SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count,
                   SUM(CASE WHEN ca.sale_category = 'Genuine' THEN 1 ELSE 0 END) AS genuine_count,
                   SUM(CASE WHEN ca.sale_category = 'Invalid' THEN 1 ELSE 0 END) AS invalid_count
            FROM call_audits ca
            WHERE ca.agent_id = :agent_id
        """), {"agent_id": agent_id}).mappings().one_or_none()
    except Exception:
        row = None

    if not row or not row["total_audits"]:
        import random
        random.seed(hash(agent_id) % (2**31))
        row = {
            "total_audits": random.randint(15, 80),
            "avg_score": round(random.uniform(60, 90), 1),
            "avg_pct": round(random.uniform(60, 90), 1),
            "fatal_count": random.randint(0, 3),
            "genuine_count": random.randint(8, 40),
            "invalid_count": random.randint(3, 15),
        }

    total = int(row["total_audits"] or 0)
    genuine = int(row["genuine_count"] or 0)
    pct = float(row["avg_pct"] or 0)

    return {
        "agent_id": agent_id,
        "total_audits": total,
        "avg_score": round(float(row["avg_score"] or 0), 1),
        "percentage": round(pct, 1),
        "color": _rag(pct),
        "fatal_count": int(row["fatal_count"] or 0),
        "genuine_count": genuine,
        "invalid_count": int(row["invalid_count"] or 0),
        "fcr_percentage": round((genuine / total) * 100, 1) if total else 0,
    }

@router.get("/{agent_id}/full-info")
def agent_full_info(agent_id: str, db: Session = Depends(get_db)):
    """Full info for agent when leaderboard clicked."""
    # Stats
    stats = db.execute(text("""
        SELECT COUNT(*) AS total,
               AVG(ca.total_score) AS avg_score,
               AVG(ca.percentage) AS avg_pct,
               SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count,
               SUM(CASE WHEN ca.sale_category = 'Genuine' THEN 1 ELSE 0 END) AS genuine_count,
               SUM(CASE WHEN ca.sale_category = 'Invalid' THEN 1 ELSE 0 END) AS invalid_count
        FROM call_audits ca WHERE ca.agent_id = :aid
    """), {"aid": agent_id}).mappings().one_or_none()

    if not stats:
        return {"agent_id": agent_id, "message": "No audits found"}

    # Params
    rows = db.execute(text("SELECT audit_json FROM call_audits WHERE agent_id = :aid LIMIT 500"),
                      {"aid": agent_id}).scalars().all()

    import json
    QUALITY_PARAMS = ["opening", "customer_understanding", "resolution_quality",
                      "communication", "call_control", "process_adherence", "closing"]
    param_totals = {p: {"score": 0, "max": 0} for p in QUALITY_PARAMS}
    for row in rows:
        j = row if isinstance(row, dict) else {}
        if isinstance(row, str):
            try:
                j = json.loads(row)
            except Exception:
                j = {}
        sections = j.get("sections") or {}
        for p in QUALITY_PARAMS:
            s = sections.get(p) or {}
            if s:
                param_totals[p]["score"] += s.get("score", 0)
                param_totals[p]["max"] += s.get("max_score", 0) or s.get("max", 0)

    params = []
    for p in QUALITY_PARAMS:
        t = param_totals[p]
        pct = round((t["score"] / t["max"]) * 100, 1) if t["max"] else 0
        params.append({
            "key": p, "label": p.replace("_", " ").title(),
            "percentage": pct,
            "color": "green" if pct >= 80 else "amber" if pct >= 60 else "red",
        })

    total = int(stats["total"] or 0)
    avg_pct = float(stats["avg_pct"] or 0)
    band = "TQ" if avg_pct >= 80 else "BQ" if avg_pct < 60 else "MQ"

    return {
        "agent_id": agent_id,
        "total_audits": total,
        "avg_score": round(float(stats["avg_score"] or 0), 1),
        "avg_percentage": round(avg_pct, 1),
        "band": band,
        "fatal_count": int(stats["fatal_count"] or 0),
        "genuine_count": int(stats["genuine_count"] or 0),
        "invalid_count": int(stats["invalid_count"] or 0),
        "parameters": params,
    }