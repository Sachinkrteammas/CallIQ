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
# 7 QUALITY PARAMETERS (client onboarding se define honge)
# ═══════════════════════════════════════════════════════════
QUALITY_PARAMS = [
    "opening",
    "customer_understanding",
    "resolution_quality",
    "communication",
    "call_control",
    "process_adherence",
    "closing",
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


def _rag_color(pct: float) -> str:
    """Return RAG color: Green >= 80, Amber 60-79, Red < 60."""
    if pct >= 80:
        return "green"
    if pct >= 60:
        return "amber"
    return "red"


# ═══════════════════════════════════════════════════════════
# OVERVIEW
# ═══════════════════════════════════════════════════════════
@router.get("/overview")
def overview(
    client_id: Optional[int] = None,
    advisor_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _ensure_audit_columns(db)
    if _db_has_audits(db, client_id):
        try:
            return _overview_from_db(db, client_id, advisor_id, from_date, to_date)
        except Exception as e:
            print(f"[overview] DB failed: {e}")
    return _overview_from_mock()


def _overview_from_db(db, client_id, advisor_id, from_date, to_date):
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

    stats = db.execute(text(f"""
        SELECT
            COUNT(*) AS calls_audited,
            AVG(ca.total_score) AS avg_score,
            AVG(ca.percentage) AS avg_percentage,
            SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count,
            SUM(CASE WHEN ca.sale_category = 'Genuine' THEN 1 ELSE 0 END) AS fcr_count
        FROM call_audits ca
        WHERE {wc}
    """), params).mappings().one_or_none()

    if not stats or not stats["calls_audited"]:
        return _overview_from_mock()

    total = int(stats["calls_audited"] or 0)
    fcr_count = int(stats["fcr_count"] or 0)
    fcr_pct = round((fcr_count / total) * 100, 1) if total else 0
    fatal_count = int(stats["fatal_count"] or 0)

    quality = [
        _kpi("Total Audits", total, "", 0, "total_audits"),
        _kpi("FCR", fcr_pct, "%", 0, "fcr"),
        _kpi("Fatal", fatal_count, "", 0, "fatal"),
        _kpi("Avg Score", round(float(stats["avg_score"] or 0), 1), "%", 2.1, "avg_score"),
    ]
    return {"quality": quality, "ai_metrics": []}


def _overview_from_mock():
    random.seed(11)
    calls = data.CALLS
    total = len(calls)
    fatal = sum(1 for c in calls if c.get("critical"))
    fcr = int(total * 0.55)
    quality = [
        _kpi("Total Audits", total, "", 0, "total_audits"),
        _kpi("FCR", round((fcr / total) * 100, 1) if total else 0, "%", 0, "fcr"),
        _kpi("Fatal", fatal, "", 0, "fatal"),
        _kpi("Avg Score", round(sum(c["score"] for c in calls) / max(total, 1), 1), "%", 2.1, "avg_score"),
    ]
    return {"quality": quality, "ai_metrics": []}


# ═══════════════════════════════════════════════════════════
# SCORE BY PARAMETER (7 params with RAG)
# ═══════════════════════════════════════════════════════════
@router.get("/score-by-parameter")
def score_by_parameter(
    client_id: Optional[int] = None,
    advisor_id: Optional[str] = None,
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

    rows = db.execute(text(f"""
        SELECT ca.audit_json FROM call_audits ca WHERE {wc}
    """), params).scalars().all()

    # Aggregate
    param_totals = {p: {"score": 0, "max": 0, "count": 0} for p in QUALITY_PARAMS}
    for row in rows:
        j = row if isinstance(row, dict) else {}
        if isinstance(row, str):
            import json
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
                param_totals[p]["count"] += 1

    result = []
    for p in QUALITY_PARAMS:
        t = param_totals[p]
        pct = round((t["score"] / t["max"]) * 100, 1) if t["max"] else 0
        result.append({
            "key": p,
            "label": PARAM_LABELS[p],
            "percentage": pct,
            "color": _rag_color(pct),
        })

    # Fallback if no data
    if not any(r["percentage"] > 0 for r in result):
        random.seed(7)
        for r in result:
            r["percentage"] = round(random.uniform(55, 92), 1)
            r["color"] = _rag_color(r["percentage"])

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
            SELECT ca.agent_id,
                   COUNT(*) AS audits,
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

    if not rows:
        # Mock fallback
        random.seed(99)
        rows = [{
            "agent_id": f"AG{60700 + i}",
            "audits": random.randint(20, 120),
            "avg_score": round(random.uniform(65, 92), 1),
            "avg_pct": round(random.uniform(65, 92), 1),
            "fatal_count": random.randint(0, 3),
        } for i in range(limit)]

    leaderboard = []
    for i, r in enumerate(rows):
        pct = float(r["avg_pct"] or 0)
        leaderboard.append({
            "rank": i + 1,
            "agent_id": r["agent_id"],
            "audits": int(r["audits"] or 0),
            "avg_score": round(float(r["avg_score"] or 0), 1),
            "percentage": round(pct, 1),
            "fatal_count": int(r["fatal_count"] or 0),
            "color": _rag_color(pct),
        })
    return {"leaderboard": leaderboard}


# ═══════════════════════════════════════════════════════════
# TRENDS (FCR, Fatal, Agent Score) — daily series
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
            SELECT DATE(ca.created_at) AS d,
                   COUNT(*) AS total,
                   SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count,
                   SUM(CASE WHEN ca.sale_category = 'Genuine' THEN 1 ELSE 0 END) AS fcr_count,
                   AVG(ca.total_score) AS avg_score
            FROM call_audits ca
            WHERE {wc}
            GROUP BY DATE(ca.created_at)
            ORDER BY d
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
            "fcr": fcr_pct,
            "fatal": fatal_pct,
            "avg_score": round(float(r["avg_score"] or 0), 1),
        })

    if not series:
        # Mock trend
        random.seed(15)
        from datetime import date, timedelta
        today = date.today()
        for i in range(14):
            d = today - timedelta(days=13 - i)
            series.append({
                "date": d.isoformat(),
                "fcr": round(random.uniform(45, 75), 1),
                "fatal": round(random.uniform(2, 12), 1),
                "avg_score": round(random.uniform(65, 88), 1),
            })

    return {"series": series}


# ═══════════════════════════════════════════════════════════
# SALES CATEGORIZATION
# ═══════════════════════════════════════════════════════════
@router.get("/sales-categorization")
def sales_categorization(
    client_id: Optional[int] = None,
    advisor_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _ensure_audit_columns(db)
    if _db_has_audits(db, client_id):
        try:
            return _sales_from_db(db, client_id, advisor_id, from_date, to_date)
        except Exception as e:
            print(f"[sales-cat] failed: {e}")
    return _sales_from_mock(client_id, advisor_id)


def _sales_from_db(db, client_id, advisor_id, from_date, to_date):
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

    rows = db.execute(text(f"""
        SELECT ca.sale_category, ca.invalid_reason, ca.agent_id, COUNT(*) AS cnt
        FROM call_audits ca WHERE {wc}
        GROUP BY ca.sale_category, ca.invalid_reason, ca.agent_id
    """), params).mappings().all()

    if not rows:
        return _sales_from_mock(client_id, advisor_id)

    genuine = sum(r["cnt"] for r in rows if r["sale_category"] == "Genuine")
    invalid = sum(r["cnt"] for r in rows if r["sale_category"] == "Invalid")
    forcefully = sum(r["cnt"] for r in rows if r["invalid_reason"] == "Forcefully Placed")
    not_confirmed = sum(r["cnt"] for r in rows if r["invalid_reason"] == "Not Confirmed")
    without_info = sum(r["cnt"] for r in rows if r["invalid_reason"] == "Without Information")
    total = sum(r["cnt"] for r in rows)

    advisor_map = {}
    for r in rows:
        adv = r["agent_id"] or "Unknown"
        if adv not in advisor_map:
            advisor_map[adv] = {"advisor": adv, "genuine": 0, "invalid": 0,
                                "forcefully_placed": 0, "not_confirmed": 0,
                                "without_information": 0, "total": 0}
        advisor_map[adv]["total"] += r["cnt"]
        if r["sale_category"] == "Genuine":
            advisor_map[adv]["genuine"] += r["cnt"]
        elif r["sale_category"] == "Invalid":
            advisor_map[adv]["invalid"] += r["cnt"]
        if r["invalid_reason"] == "Forcefully Placed":
            advisor_map[adv]["forcefully_placed"] += r["cnt"]
        elif r["invalid_reason"] == "Not Confirmed":
            advisor_map[adv]["not_confirmed"] += r["cnt"]
        elif r["invalid_reason"] == "Without Information":
            advisor_map[adv]["without_information"] += r["cnt"]

    return {
        "genuine": genuine, "invalid": invalid,
        "forcefully_placed": forcefully, "not_confirmed": not_confirmed,
        "without_information": without_info, "total": total,
        "genuine_percentage": round((genuine / total) * 100, 1) if total else 0,
        "invalid_percentage": round((invalid / total) * 100, 1) if total else 0,
        "advisor_breakdown": list(advisor_map.values()),
    }


def _sales_from_mock(client_id, advisor_id):
    random.seed(22)
    calls = data.CALLS
    genuine = invalid = forcefully = not_confirmed = without_info = 0
    advisor_map = {}
    for c in calls:
        random.seed(hash(c.get("id", "")) % (2**31))
        r = random.random()
        if r < 0.55:
            sc, ir = "Genuine", None
        elif r < 0.70:
            sc, ir = "Invalid", "Forcefully Placed"
        elif r < 0.85:
            sc, ir = "Invalid", "Not Confirmed"
        else:
            sc, ir = "Invalid", "Without Information"

        adv = c.get("agent_id") or "Unknown"
        if adv not in advisor_map:
            advisor_map[adv] = {"advisor": adv, "genuine": 0, "invalid": 0,
                                "forcefully_placed": 0, "not_confirmed": 0,
                                "without_information": 0, "total": 0}
        advisor_map[adv]["total"] += 1
        if sc == "Genuine":
            genuine += 1; advisor_map[adv]["genuine"] += 1
        else:
            invalid += 1; advisor_map[adv]["invalid"] += 1
            if ir == "Forcefully Placed":
                forcefully += 1; advisor_map[adv]["forcefully_placed"] += 1
            elif ir == "Not Confirmed":
                not_confirmed += 1; advisor_map[adv]["not_confirmed"] += 1
            else:
                without_info += 1; advisor_map[adv]["without_information"] += 1

    total = len(calls)
    return {
        "genuine": genuine, "invalid": invalid,
        "forcefully_placed": forcefully, "not_confirmed": not_confirmed,
        "without_information": without_info, "total": total,
        "genuine_percentage": round((genuine / total) * 100, 1) if total else 0,
        "invalid_percentage": round((invalid / total) * 100, 1) if total else 0,
        "advisor_breakdown": list(advisor_map.values()),
    }


# ═══════════════════════════════════════════════════════════
# CALL DURATION CATEGORIES
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
    try:
        where = ["cl.duration IS NOT NULL"]
        params = {}
        if client_id:
            where.append("cl.client_id = :client_id")
            params["client_id"] = client_id
        if from_date:
            where.append("cl.created_at >= :from_date")
            params["from_date"] = from_date
        if to_date:
            where.append("cl.created_at <= :to_date")
            params["to_date"] = to_date + " 23:59:59"
        wc = " AND ".join(where)
        rows = db.execute(text(f"SELECT cl.duration FROM call_logs cl WHERE {wc}"), params).mappings().all()
        if rows:
            return _duration_compute(rows, short_max, medium_max)
    except Exception:
        pass
    rows = [{"duration": c.get("duration_sec", 0)} for c in data.CALLS]
    return _duration_compute(rows, short_max, medium_max)


def _duration_compute(rows, short_max, medium_max):
    short = medium = long_calls = 0
    for r in rows:
        d = r.get("duration") or 0
        if d <= short_max:
            short += 1
        elif d <= medium_max:
            medium += 1
        else:
            long_calls += 1
    total = len(rows)
    return {
        "short": short, "medium": medium, "long": long_calls, "total": total,
        "short_percentage": round((short / total) * 100, 1) if total else 0,
        "medium_percentage": round((medium / total) * 100, 1) if total else 0,
        "long_percentage": round((long_calls / total) * 100, 1) if total else 0,
        "thresholds": {"short_max": short_max, "medium_max": medium_max},
    }


# ═══════════════════════════════════════════════════════════
# MONTHLY AUDIT SUMMARY
# ═══════════════════════════════════════════════════════════
@router.get("/monthly-audit-summary")
def monthly_audit_summary(
    client_id: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    _ensure_audit_columns(db)
    if year is None:
        year = datetime.now().year

    where = ["YEAR(ca.created_at) = :year"]
    params = {"year": year}
    if client_id:
        where.append("ca.client_id = :client_id")
        params["client_id"] = client_id
    wc = " AND ".join(where)

    try:
        rows = db.execute(text(f"""
            SELECT MONTH(ca.created_at) AS m, COUNT(*) AS cnt, AVG(ca.total_score) AS avg_score
            FROM call_audits ca WHERE {wc}
            GROUP BY MONTH(ca.created_at) ORDER BY m
        """), params).mappings().all()
    except Exception:
        rows = []

    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    monthly = {i: {"month_num": i, "month": month_names[i - 1],
                   "audit_count": 0, "avg_score": 0} for i in range(1, 13)}
    for r in rows:
        m = r["m"]
        monthly[m]["audit_count"] = r["cnt"]
        monthly[m]["avg_score"] = round(float(r["avg_score"] or 0), 1)

    total = sum(m["audit_count"] for m in monthly.values())
    current_month = datetime.now().month
    return {
        "year": year,
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