from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

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
# LIST AGENTS (with filters)
# ═══════════════════════════════════════════════════════════
@router.get("")
def list_agents(
    client_id: Optional[int] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Return agents with audit stats.
    If DB has audits, aggregate from there.
    Otherwise fallback to mock.
    """
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
        # Mock fallback
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
# SIMPLE LIST (for filters / dropdowns)
# ═══════════════════════════════════════════════════════════
@router.get("/list")
def list_agents_simple(
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Simple list of agent IDs for filter dropdowns.
    """
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
# AGENT DETAIL
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

    # Mock if empty
    if not any(r["percentage"] > 0 for r in result):
        import random
        random.seed(hash(agent_id) % (2**31))
        for r in result:
            r["percentage"] = round(random.uniform(55, 95), 1)
            r["color"] = _rag(r["percentage"])

    return {"agent_id": agent_id, "parameters": result}


# ═══════════════════════════════════════════════════════════
# AGENT DETAILS (full)
# ═══════════════════════════════════════════════════════════
@router.get("/{agent_id}")
def get_agent(
    agent_id: str,
    db: Session = Depends(get_db),
):
    # Get stats
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
        # Mock
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


# ═══════════════════════════════════════════════════════════
# AGENT COMPARISON (all agents params side by side)
# ═══════════════════════════════════════════════════════════
@router.get("/comparison")
def agent_comparison(
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Returns: params × agents matrix for comparison view.
    """
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
    # {agent_id: {param: {score, max}}}
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

    # Build result
    result = []
    for a, params_data in agent_data.items():
        row = {"agent_id": a, "parameters": {}}
        for p in QUALITY_PARAMS:
            t = params_data[p]
            pct = round((t["score"] / t["max"]) * 100, 1) if t["max"] else 0
            row["parameters"][p] = {"percentage": pct, "color": _rag(pct)}
        result.append(row)

    if not result:
        # Mock
        import random
        random.seed(42)
        for a in data.AGENTS[:10]:
            row = {"agent_id": a["id"], "parameters": {}}
            for p in QUALITY_PARAMS:
                pct = round(random.uniform(55, 92), 1)
                row["parameters"][p] = {"percentage": pct, "color": _rag(pct)}
            result.append(row)

    return {"comparison": result, "parameters": [
        {"key": p, "label": PARAM_LABELS[p]} for p in QUALITY_PARAMS
    ]}


# ═══════════════════════════════════════════════════════════
# SUB-PARAMETER DRILLDOWN
# ═══════════════════════════════════════════════════════════
@router.get("/{agent_id}/sub-parameter-drilldown")
def sub_parameter_drilldown(
    agent_id: str,
    db: Session = Depends(get_db),
):
    """
    Returns sub-parameter scores for drill-down graph.
    """
    # Mock for now — can be extended from audit_json
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


# ═══════════════════════════════════════════════════════════
# AI COACHING (agent-wise)
# ═══════════════════════════════════════════════════════════
@router.get("/{agent_id}/coaching")
def agent_coaching(
    agent_id: str,
    db: Session = Depends(get_db),
):
    """
    Returns AI coaching recommendations for the agent.
    """
    # Mock — can be extended from audit_json
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


@router.get("/coaching/all")
def all_coaching(
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Coaching for all agents of a client."""
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