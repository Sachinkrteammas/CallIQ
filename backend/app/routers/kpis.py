import random
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Query, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from .. import data

router = APIRouter(prefix="/api/kpis", tags=["kpis"])

_MIGRATION_DONE = False

# ═══════════════════════════════════════════════════════════
# QUALITY BAND THRESHOLDS (client confirm kar sakta hai)
# ═══════════════════════════════════════════════════════════
BQ_MAX = 60    # < 60% → Bottom Quality
TQ_MIN = 80    # >= 80% → Top Quality
# 60-79% → Medium Quality

QUALITY_PARAMS = [
    "opening", "customer_understanding", "resolution_quality",
    "communication", "call_control", "process_adherence", "closing",
]
PARAM_LABELS = {
    "opening": "Opening", "customer_understanding": "Customer Understanding",
    "resolution_quality": "Resolution Quality", "communication": "Communication",
    "call_control": "Call Control", "process_adherence": "Process Adherence",
    "closing": "Closing",
}


def _ensure_audit_columns(db: Session):
    global _MIGRATION_DONE
    if _MIGRATION_DONE:
        return
    try:
        cols = set(db.execute(text("""
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'call_audits'
        """)).scalars().all() or [])
        new_cols = [
            ("sale_category", "VARCHAR(50) DEFAULT 'Unknown'"),
            ("invalid_reason", "VARCHAR(255) DEFAULT NULL"),
            ("crm_sale_done", "BOOLEAN DEFAULT FALSE"),
            ("customer_confirmation", "VARCHAR(50) DEFAULT 'Not Confirmed'"),
            ("order_information", "VARCHAR(50) DEFAULT 'Not Available'"),
        ]
        for col_name, col_def in new_cols:
            if col_name not in cols:
                try:
                    db.execute(text(f"ALTER TABLE call_audits ADD COLUMN {col_name} {col_def}"))
                except Exception:
                    pass
        db.commit()
        _MIGRATION_DONE = True
    except Exception:
        pass


def _kpi(label, value, unit, trend, key):
    return {"label": label, "value": value, "unit": unit, "trend": trend,
            "direction": "up" if trend >= 0 else "down", "key": key}


def _db_has_audits(db: Session, client_id: Optional[int] = None) -> bool:
    try:
        sql = "SELECT COUNT(*) FROM call_audits"
        params = {}
        if client_id:
            sql += " WHERE client_id = :cid"
            params["cid"] = client_id
        return (db.execute(text(sql), params).scalar() or 0) > 0
    except Exception:
        return False


def _rag(pct):
    if pct >= 80: return "green"
    if pct >= 60: return "amber"
    return "red"


# ═══════════════════════════════════════════════════════════
# QUALITY BANDS (BQ / MQ / TQ) — NEW ENDPOINT
# ═══════════════════════════════════════════════════════════
@router.get("/quality-bands")
def quality_bands(
    client_id: Optional[int] = None,
    advisor_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    bq_max: int = BQ_MAX,
    tq_min: int = TQ_MIN,
    db: Session = Depends(get_db),
):
    """
    Classify calls into BQ / MQ / TQ based on percentage.
    - BQ (Bottom Quality): percentage < bq_max (default 60)
    - MQ (Medium Quality): bq_max <= percentage < tq_min (default 60-79)
    - TQ (Top Quality): percentage >= tq_min (default 80)
    """
    _ensure_audit_columns(db)

    where = ["1=1"]
    params = {}
    if client_id:
        where.append("ca.client_id = :client_id")
        params["client_id"] = client_id
    if advisor_id:
        where.append("ca.agent_id = :advisor_id")
        params["advisor_id"] = advisor_id
    if from_date:
        where.append("ca.created_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append("ca.created_at <= :to_date")
        params["to_date"] = to_date + " 23:59:59"
    wc = " AND ".join(where)
    params["bq"] = bq_max
    params["tq"] = tq_min

    try:
        stats = db.execute(text(f"""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN ca.percentage < :bq THEN 1 ELSE 0 END) AS bq_count,
                SUM(CASE WHEN ca.percentage >= :tq THEN 1 ELSE 0 END) AS tq_count,
                SUM(CASE WHEN ca.percentage >= :bq AND ca.percentage < :tq THEN 1 ELSE 0 END) AS mq_count,
                AVG(ca.percentage) AS avg_pct
            FROM call_audits ca
            WHERE {wc}
        """), params).mappings().one_or_none()
    except Exception as e:
        print(f"[quality-bands] query failed: {e}")
        stats = None

    if not stats or not stats["total"]:
        return _quality_bands_mock(bq_max, tq_min)

    total = int(stats["total"])
    bq = int(stats["bq_count"] or 0)
    mq = int(stats["mq_count"] or 0)
    tq = int(stats["tq_count"] or 0)

    # Agent-level breakdown
    agent_where = ["1=1"]
    agent_params = {}
    if client_id:
        agent_where.append("ca.client_id = :client_id")
        agent_params["client_id"] = client_id
    if from_date:
        agent_where.append("ca.created_at >= :from_date")
        agent_params["from_date"] = from_date
    if to_date:
        agent_where.append("ca.created_at <= :to_date")
        agent_params["to_date"] = to_date + " 23:59:59"
    awc = " AND ".join(agent_where)
    agent_params["bq"] = bq_max
    agent_params["tq"] = tq_min

    try:
        agent_rows = db.execute(text(f"""
            SELECT ca.agent_id,
                   COUNT(*) AS total,
                   SUM(CASE WHEN ca.percentage < :bq THEN 1 ELSE 0 END) AS bq_count,
                   SUM(CASE WHEN ca.percentage >= :tq THEN 1 ELSE 0 END) AS tq_count,
                   SUM(CASE WHEN ca.percentage >= :bq AND ca.percentage < :tq THEN 1 ELSE 0 END) AS mq_count,
                   AVG(ca.percentage) AS avg_pct
            FROM call_audits ca
            WHERE {awc} AND ca.agent_id IS NOT NULL
            GROUP BY ca.agent_id
            ORDER BY avg_pct DESC
            LIMIT 20
        """), agent_params).mappings().all()
    except Exception:
        agent_rows = []

    agents = []
    for r in agent_rows:
        avg = float(r["avg_pct"] or 0)
        # Agent ka band — based on avg %
        if avg < bq_max:
            agent_band = "BQ"
        elif avg >= tq_min:
            agent_band = "TQ"
        else:
            agent_band = "MQ"
        agents.append({
            "agent_id": r["agent_id"],
            "total": int(r["total"]),
            "bq": int(r["bq_count"] or 0),
            "mq": int(r["mq_count"] or 0),
            "tq": int(r["tq_count"] or 0),
            "avg_percentage": round(avg, 1),
            "band": agent_band,
        })

    return {
        "total": total,
        "bq": bq, "mq": mq, "tq": tq,
        "bq_percentage": round((bq / total) * 100, 1) if total else 0,
        "mq_percentage": round((mq / total) * 100, 1) if total else 0,
        "tq_percentage": round((tq / total) * 100, 1) if total else 0,
        "avg_percentage": round(float(stats["avg_pct"] or 0), 1),
        "thresholds": {"bq_max": bq_max, "tq_min": tq_min},
        "agent_breakdown": agents,
    }


def _quality_bands_mock(bq_max, tq_min):
    random.seed(11)
    total = 0
    return {
        "total": 0, "bq": 0, "mq": 0, "tq": 0,
        "bq_percentage": 0, "mq_percentage": 0, "tq_percentage": 0,
        "avg_percentage": 0,
        "thresholds": {"bq_max": bq_max, "tq_min": tq_min},
        "agent_breakdown": [],
    }


# ═══════════════════════════════════════════════════════════
# OVERVIEW — FCR, Fatal, Avg Score
# ═══════════════════════════════════════════════════════════
@router.get("/overview")
def overview(
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _ensure_audit_columns(db)
    if not _db_has_audits(db, client_id):
        return _overview_mock()

    where = ["1=1"]
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

    stats = db.execute(text(f"""
        SELECT
            COUNT(*) AS total,
            AVG(ca.total_score) AS avg_score,
            SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count,
            SUM(CASE WHEN ca.sale_category = 'Genuine' THEN 1 ELSE 0 END) AS genuine_count
        FROM call_audits ca WHERE {wc}
    """), params).mappings().one_or_none()

    if not stats or not stats["total"]:
        return _overview_mock()

    total = int(stats["total"])
    genuine = int(stats["genuine_count"] or 0)
    fcr_pct = round((genuine / total) * 100, 1) if total else 0

    quality = [
        _kpi("Total Audits", total, "", 0, "total_audits"),
        _kpi("FCR", fcr_pct, "%", 0, "fcr"),
        _kpi("Fatal", int(stats["fatal_count"] or 0), "", 0, "fatal"),
        _kpi("Avg Score", round(float(stats["avg_score"] or 0), 1), "%", 0, "avg_score"),
    ]
    return {"quality": quality, "ai_metrics": []}


def _overview_mock():
    random.seed(11)
    return {"quality": [
        _kpi("Total Audits", 0, "", 0, "total_audits"),
        _kpi("FCR", 0, "%", 0, "fcr"),
        _kpi("Fatal", 0, "", 0, "fatal"),
        _kpi("Avg Score", 0, "%", 0, "avg_score"),
    ], "ai_metrics": []}


# ═══════════════════════════════════════════════════════════
# SCORE BY PARAMETER
# ═══════════════════════════════════════════════════════════
@router.get("/score-by-parameter")
def score_by_parameter(
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _ensure_audit_columns(db)
    where = ["1=1"]
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
        rows = db.execute(text(f"SELECT ca.audit_json FROM call_audits ca WHERE {wc}"), params).scalars().all()
    except Exception:
        rows = []

    import json
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

    result = []
    for p in QUALITY_PARAMS:
        t = param_totals[p]
        pct = round((t["score"] / t["max"]) * 100, 1) if t["max"] else 0
        result.append({
            "key": p, "label": PARAM_LABELS[p],
            "percentage": pct, "color": _rag(pct),
        })
    return {"parameters": result}


# ═══════════════════════════════════════════════════════════
# AGENT LEADERBOARD
# ═══════════════════════════════════════════════════════════
@router.get("/agent-leaderboard")
def agent_leaderboard(
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 10,
    db: Session = Depends(get_db),
):
    _ensure_audit_columns(db)
    where = ["1=1"]
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
    params["lim"] = limit

    try:
        rows = db.execute(text(f"""
            SELECT ca.agent_id, COUNT(*) AS audits,
                   AVG(ca.total_score) AS avg_score,
                   AVG(ca.percentage) AS avg_pct,
                   SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count
            FROM call_audits ca
            WHERE {wc} AND ca.agent_id IS NOT NULL
            GROUP BY ca.agent_id
            ORDER BY avg_pct DESC
            LIMIT :lim
        """), params).mappings().all()
    except Exception:
        rows = []

    leaderboard = []
    for i, r in enumerate(rows):
        pct = float(r["avg_pct"] or 0)
        # Band
        if pct < BQ_MAX:
            band = "BQ"
        elif pct >= TQ_MIN:
            band = "TQ"
        else:
            band = "MQ"
        leaderboard.append({
            "rank": i + 1,
            "agent_id": r["agent_id"],
            "audits": int(r["audits"] or 0),
            "avg_score": round(float(r["avg_score"] or 0), 1),
            "percentage": round(pct, 1),
            "fatal_count": int(r["fatal_count"] or 0),
            "color": _rag(pct),
            "band": band,
        })
    return {"leaderboard": leaderboard}


# ═══════════════════════════════════════════════════════════
# TRENDS
# ═══════════════════════════════════════════════════════════
@router.get("/trends")
def trends(
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _ensure_audit_columns(db)
    where = ["1=1"]
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
            SELECT DATE(ca.created_at) AS d, COUNT(*) AS total,
                   SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count,
                   SUM(CASE WHEN ca.sale_category = 'Genuine' THEN 1 ELSE 0 END) AS fcr_count,
                   AVG(ca.total_score) AS avg_score
            FROM call_audits ca WHERE {wc}
            GROUP BY DATE(ca.created_at) ORDER BY d
        """), params).mappings().all()
    except Exception:
        rows = []

    series = []
    for r in rows:
        total = int(r["total"] or 0)
        fcr_pct = round((int(r["fcr_count"] or 0) / total) * 100, 1) if total else 0
        fatal_pct = round((int(r["fatal_count"] or 0) / total) * 100, 1) if total else 0
        series.append({
            "date": str(r["d"]),
            "fcr": fcr_pct, "fatal": fatal_pct,
            "avg_score": round(float(r["avg_score"] or 0), 1),
        })
    return {"series": series}


# ═══════════════════════════════════════════════════════════
# SALES CATEGORIZATION (only Genuine + Invalid)
# ═══════════════════════════════════════════════════════════
@router.get("/sales-categorization")
def sales_categorization(
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _ensure_audit_columns(db)
    if not _db_has_audits(db, client_id):
        return _sales_mock()

    where = ["1=1"]
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

    rows = db.execute(text(f"""
        SELECT ca.sale_category, ca.invalid_reason, ca.agent_id, COUNT(*) AS cnt
        FROM call_audits ca WHERE {wc}
        GROUP BY ca.sale_category, ca.invalid_reason, ca.agent_id
    """), params).mappings().all()

    genuine = 0
    invalid = 0
    forcefully = 0
    not_confirmed = 0
    without_info = 0
    total_classified = 0

    advisor_map = {}
    for r in rows:
        sc = r["sale_category"]
        if sc not in ("Genuine", "Invalid"):
            continue

        adv = r["agent_id"] or "Unknown"
        if adv not in advisor_map:
            advisor_map[adv] = {"advisor": adv, "genuine": 0, "invalid": 0,
                                "forcefully_placed": 0, "not_confirmed": 0,
                                "without_information": 0, "total": 0}

        advisor_map[adv]["total"] += r["cnt"]
        total_classified += r["cnt"]

        if sc == "Genuine":
            genuine += r["cnt"]
            advisor_map[adv]["genuine"] += r["cnt"]
        else:
            invalid += r["cnt"]
            advisor_map[adv]["invalid"] += r["cnt"]
            if r["invalid_reason"] == "Forcefully Placed":
                forcefully += r["cnt"]
                advisor_map[adv]["forcefully_placed"] += r["cnt"]
            elif r["invalid_reason"] == "Not Confirmed":
                not_confirmed += r["cnt"]
                advisor_map[adv]["not_confirmed"] += r["cnt"]
            elif r["invalid_reason"] == "Without Information":
                without_info += r["cnt"]
                advisor_map[adv]["without_information"] += r["cnt"]

    return {
        "genuine": genuine, "invalid": invalid,
        "forcefully_placed": forcefully, "not_confirmed": not_confirmed,
        "without_information": without_info,
        "total": total_classified,
        "genuine_percentage": round((genuine / total_classified) * 100, 1) if total_classified else 0,
        "invalid_percentage": round((invalid / total_classified) * 100, 1) if total_classified else 0,
        "advisor_breakdown": list(advisor_map.values()),
    }


def _sales_mock():
    return {
        "genuine": 0, "invalid": 0,
        "forcefully_placed": 0, "not_confirmed": 0, "without_information": 0,
        "total": 0, "genuine_percentage": 0, "invalid_percentage": 0,
        "advisor_breakdown": [],
    }


# ═══════════════════════════════════════════════════════════
# CALL DURATION
# ═══════════════════════════════════════════════════════════
@router.get("/call-duration-categories")
def call_duration_categories(
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    short_max: int = 120,
    medium_max: int = 600,
    db: Session = Depends(get_db),
):
    where = ["cl.duration IS NOT NULL"]
    params = {}
    if client_id:
        where.append("cl.client_id = :client_id")
        params["client_id"] = client_id
    if from_date:
        where.append("cl.start_time >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append("cl.start_time <= :to_date")
        params["to_date"] = to_date + " 23:59:59"
    wc = " AND ".join(where)

    try:
        rows = db.execute(text(f"SELECT cl.duration FROM call_logs cl WHERE {wc}"), params).mappings().all()
    except Exception:
        rows = []

    short = medium = long_c = 0
    for r in rows:
        d = r.get("duration") or 0
        if d <= short_max: short += 1
        elif d <= medium_max: medium += 1
        else: long_c += 1
    total = len(rows)
    return {
        "short": short, "medium": medium, "long": long_c, "total": total,
        "short_percentage": round((short / total) * 100, 1) if total else 0,
        "medium_percentage": round((medium / total) * 100, 1) if total else 0,
        "long_percentage": round((long_c / total) * 100, 1) if total else 0,
        "thresholds": {"short_max": short_max, "medium_max": medium_max},
    }


# ═══════════════════════════════════════════════════════════
# MONTHLY SUMMARY
# ═══════════════════════════════════════════════════════════
@router.get("/monthly-audit-summary")
def monthly_audit_summary(
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _ensure_audit_columns(db)
    where = ["1=1"]
    params = {}

    if from_date and to_date:
        where.append("ca.created_at >= :from_date")
        where.append("ca.created_at <= :to_date")
        params["from_date"] = from_date
        params["to_date"] = to_date + " 23:59:59"
    else:
        year = datetime.now().year
        where.append("YEAR(ca.created_at) = :year")
        params["year"] = year

    if client_id:
        where.append("ca.client_id = :client_id")
        params["client_id"] = client_id

    wc = " AND ".join(where)

    try:
        rows = db.execute(text(f"""
            SELECT MONTH(ca.created_at) AS m, COUNT(*) AS cnt
            FROM call_audits ca WHERE {wc}
            GROUP BY MONTH(ca.created_at) ORDER BY m
        """), params).mappings().all()
    except Exception:
        rows = []

    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    monthly = {i: {"month_num": i, "month": month_names[i - 1], "audit_count": 0} for i in range(1, 13)}
    for r in rows:
        monthly[r["m"]]["audit_count"] = r["cnt"]

    total = sum(m["audit_count"] for m in monthly.values())
    current_month = datetime.now().month

    return {
        "year": datetime.now().year,
        "monthly": list(monthly.values()),
        "total_audits": total,
        "current_month": current_month,
        "current_month_name": month_names[current_month - 1],
        "current_month_audits": monthly[current_month]["audit_count"],
    }


@router.get("/health-score")
def health_score():
    return {"score": 76, "band": "amber", "breakdown": [
        {"label": "Conversation Quality", "value": 81},
        {"label": "Customer Experience", "value": 72},
        {"label": "Compliance", "value": 68},
        {"label": "Communication", "value": 79},
        {"label": "Professionalism", "value": 84},
    ]}


@router.get("/insights")
def insights():
    return data.AI_INSIGHTS


@router.get("/trend")
def trend():
    return data.WEEKLY_TREND