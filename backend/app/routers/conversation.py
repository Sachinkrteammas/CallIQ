import random
from datetime import datetime, timedelta
from fastapi import APIRouter, Query, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import data
from ..database import get_db
from .auth import get_current_user

router = APIRouter(prefix="/api/conversation", tags=["conversation"])


@router.get("/distribution")
def distribution(
    client_id: str = Query(default=None, description="'all' or numeric id"),
    from_date: str = Query(default=None),
    to_date: str = Query(default=None),
    client_type: str = Query(default=None, description="Sales or Service"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Behaviour distribution — real VAD data if client_id is given, else demo data."""
    # If a real client context is available, pull from call_vad_metrics
    if client_id:
        if not to_date:
            to_date = datetime.now().strftime("%Y-%m-%d")
        if not from_date:
            from_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

        # Non-admin users are locked to their own client
        if not user.get("is_admin"):
            client_id = str(user.get("client_id") or "all")
            client_type = None

        filters = ["call_date BETWEEN :from_date AND :to_date"]
        params = {"from_date": from_date, "to_date": to_date}

        if client_id != "all":
            try:
                params["client_id"] = int(client_id)
                filters.append("client_id = :client_id")
            except (TypeError, ValueError):
                pass
        elif client_type and client_type.lower() in ("sales", "service"):
            op = "=" if client_type.lower() == "sales" else "!="
            filters.append(
                f"client_id IN (SELECT id FROM clients "
                f"WHERE COALESCE(ingroups, '') {op} '' COLLATE utf8mb4_general_ci)"
            )

        where = " AND ".join(filters)
        row = db.execute(text(f"""
            SELECT
                COALESCE(AVG(dead_air_pct), 0)          AS dead_air,
                COALESCE(AVG(long_hold_sec), 0)         AS long_hold,
                COALESCE(AVG(interruptions), 0)         AS interruptions,
                COALESCE(AVG(talk_ratio_pct), 0)        AS talk_ratio,
                COALESCE(AVG(silence_pct), 0)           AS silence,
                COALESCE(AVG(cross_talk_pct), 0)        AS cross_talk,
                COALESCE(AVG(escalation_pct), 0)        AS escalation,
                COALESCE(AVG(script_deviation_pct), 0)  AS script_deviation,
                COUNT(*)                                AS total_calls
            FROM call_vad_metrics
            WHERE {where}
        """), params).mappings().one()

        if row["total_calls"] and int(row["total_calls"]) > 0:
            rng = random.Random(hash(client_id) % 9999)

            def spark(base, n=10):
                return [round(base + rng.uniform(-3, 3), 1) for _ in range(n)]

            return [
                {"label": "Dead Air", "value": round(float(row["dead_air"]), 1), "unit": "%", "trend": 0.0, "spark": spark(float(row["dead_air"]))},
                {"label": "Long Hold", "value": round(float(row["long_hold"]), 1), "unit": "s", "trend": 0.0, "spark": spark(float(row["long_hold"]) / 10)},
                {"label": "Frequent Interruptions", "value": round(float(row["interruptions"]), 1), "unit": "/call", "trend": 0.0, "spark": spark(float(row["interruptions"]))},
                {"label": "Agent Talking %", "value": round(float(row["talk_ratio"]), 1), "unit": "%", "trend": 0.0, "spark": spark(float(row["talk_ratio"]))},
                {"label": "Silence %", "value": round(float(row["silence"]), 1), "unit": "%", "trend": 0.0, "spark": spark(float(row["silence"]))},
                {"label": "Cross Talk %", "value": round(float(row["cross_talk"]), 1), "unit": "%", "trend": 0.0, "spark": spark(float(row["cross_talk"]))},
                {"label": "Escalation", "value": round(float(row["escalation"]), 1), "unit": "%", "trend": 0.0, "spark": spark(float(row["escalation"]))},
                {"label": "Script Deviation", "value": round(float(row["script_deviation"]), 1), "unit": "%", "trend": 0.0, "spark": spark(float(row["script_deviation"]))},
            ]

    # Fallback: original demo data
    random.seed(21)

    def spark(base, n=10):
        return [round(base + random.uniform(-4, 4), 1) for _ in range(n)]

    return [
        {"label": "Dead Air", "value": 8.4, "unit": "%", "trend": 3.8, "spark": spark(8)},
        {"label": "Long Hold", "value": 12.1, "unit": "%", "trend": 5.1, "spark": spark(12)},
        {"label": "Frequent Interruptions", "value": 3.6, "unit": "/call", "trend": 4.4, "spark": spark(3.6)},
        {"label": "Customer Talking %", "value": 46.2, "unit": "%", "trend": -1.2, "spark": spark(46)},
        {"label": "Agent Talking %", "value": 41.8, "unit": "%", "trend": 0.8, "spark": spark(42)},
        {"label": "Silence %", "value": 12.0, "unit": "%", "trend": 2.0, "spark": spark(12)},
        {"label": "Cross Talk %", "value": 6.3, "unit": "%", "trend": -0.6, "spark": spark(6)},
        {"label": "Escalation", "value": 9.7, "unit": "%", "trend": 2.9, "spark": spark(9.7)},
    ]


@router.get("/heatmap")
def heatmap(db: Session = Depends(get_db)):
    random.seed(22)
    # Prefer real process/client names from the DB so the heatmap shows
    # actual processes (e.g. LPNO, MAPL) instead of generic sample names.
    try:
        names = [
            r[0]
            for r in db.execute(
                text("SELECT name FROM clients WHERE is_active = 1 ORDER BY name")
            ).all()
        ]
    except Exception:
        names = []
    teams = names or data.TEAMS
    rows = []
    for team in teams:
        cells = {}
        for b in data.BEHAVIOURS:
            score = random.random()
            level = "green" if score < 0.55 else ("amber" if score < 0.82 else "red")
            cells[b] = level
        rows.append({"team": team, "cells": cells})
    return {"behaviours": data.BEHAVIOURS, "rows": rows}


@router.get("/findings")
def findings(
    client_id: str = Query(default=None),
    from_date: str = Query(default=None),
    to_date: str = Query(default=None),
    client_type: str = Query(default=None),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Top AI findings derived from real audited calls."""
    if not to_date:
        to_date = datetime.now().strftime("%Y-%m-%d")
    if not from_date:
        from_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    if not user.get("is_admin"):
        client_id = str(user.get("client_id") or "all")
        client_type = None

    where = ["DATE(ca.created_at) BETWEEN :from_date AND :to_date"]
    params = {"from_date": from_date, "to_date": to_date}

    if client_id and client_id != "all":
        try:
            params["client_id"] = int(client_id)
            where.append("ca.client_id = :client_id")
        except (TypeError, ValueError):
            pass
    elif client_type and client_type.lower() in ("sales", "service"):
        op = "=" if client_type.lower() == "sales" else "!="
        where.append(
            f"ca.client_id IN (SELECT id FROM clients "
            f"WHERE COALESCE(ingroups, '') {op} '' COLLATE utf8mb4_general_ci)"
        )

    wc = " AND ".join(where)
    out = []

    try:
        fatal_rows = db.execute(text(f"""
            SELECT ca.call_id, ca.agent_id
            FROM call_audits ca
            WHERE {wc} AND (ca.fatal_flag = 1 OR ca.percentage < 60)
            ORDER BY ca.created_at DESC
            LIMIT 12
        """), params).mappings().all()
    except Exception:
        fatal_rows = []

    if fatal_rows:
        call_ids = [r["call_id"] for r in fatal_rows if r.get("call_id")]
        agents = list({r["agent_id"] for r in fatal_rows if r.get("agent_id")})[:6]
        out.append({
            "id": "fatal_low_score",
            "icon": "alert-triangle",
            "severity": "Critical",
            "description": f"{len(call_ids)} calls flagged as fatal or low quality in the selected period.",
            "affected_calls": call_ids[:10],
            "affected_agents": agents,
        })

    try:
        low_rows = db.execute(text(f"""
            SELECT ca.call_id, ca.agent_id, ca.percentage
            FROM call_audits ca
            WHERE {wc} AND ca.percentage < 89 AND ca.fatal_flag = 0
            ORDER BY ca.percentage ASC, ca.created_at DESC
            LIMIT 10
        """), params).mappings().all()
    except Exception:
        low_rows = []

    if low_rows:
        call_ids = [r["call_id"] for r in low_rows if r.get("call_id")]
        agents = list({r["agent_id"] for r in low_rows if r.get("agent_id")})[:6]
        out.append({
            "id": "needs_improvement",
            "icon": "trending-down",
            "severity": "High",
            "description": f"{len(call_ids)} calls scored below MQ threshold (89%) and need review/coaching.",
            "affected_calls": call_ids[:10],
            "affected_agents": agents,
        })

    try:
        invalid_rows = db.execute(text(f"""
            SELECT ca.call_id, ca.agent_id
            FROM call_audits ca
            WHERE {wc} AND ca.sale_category = 'Invalid'
            ORDER BY ca.created_at DESC
            LIMIT 10
        """), params).mappings().all()
    except Exception:
        invalid_rows = []

    if invalid_rows:
        call_ids = [r["call_id"] for r in invalid_rows if r.get("call_id")]
        agents = list({r["agent_id"] for r in invalid_rows if r.get("agent_id")})[:6]
        out.append({
            "id": "invalid_sales",
            "icon": "shield-alert",
            "severity": "High",
            "description": f"{len(call_ids)} invalid sales detected (forcefully placed / not confirmed / without information).",
            "affected_calls": call_ids[:10],
            "affected_agents": agents,
        })

    try:
        recent_rows = db.execute(text(f"""
            SELECT ca.call_id, ca.agent_id
            FROM call_audits ca
            WHERE {wc}
            ORDER BY ca.created_at DESC
            LIMIT 10
        """), params).mappings().all()
    except Exception:
        recent_rows = []

    if recent_rows and not out:
        call_ids = [r["call_id"] for r in recent_rows if r.get("call_id")]
        agents = list({r["agent_id"] for r in recent_rows if r.get("agent_id")})[:6]
        out.append({
            "id": "recent_audits",
            "icon": "sparkles",
            "severity": "Low",
            "description": f"{len(call_ids)} recent audited calls available for review.",
            "affected_calls": call_ids[:10],
            "affected_agents": agents,
        })

    return out