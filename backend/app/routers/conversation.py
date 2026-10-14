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
def heatmap():
    random.seed(22)
    rows = []
    for team in data.TEAMS:
        cells = {}
        for b in data.BEHAVIOURS:
            score = random.random()
            level = "green" if score < 0.55 else ("amber" if score < 0.82 else "red")
            cells[b] = level
        rows.append({"team": team, "cells": cells})
    return {"behaviours": data.BEHAVIOURS, "rows": rows}


@router.get("/findings")
def findings():
    random.seed(23)
    templates = [
        ("Repeated dead air over 15s detected across Billing queue calls", "High", "phone-off"),
        ("Agents frequently overtalk customers during refund disputes", "Medium", "mic"),
        ("Compliance disclaimer skipped in 1 of 6 calls this week", "High", "shield-alert"),
        ("Abusive language detected in escalated Technical Support calls", "Critical", "alert-triangle"),
        ("Hold time exceeds 3 minutes on VIP-Support queue", "Medium", "clock"),
        ("Script deviation increasing on outbound sales calls", "Low", "file-warning"),
    ]
    out = []
    for i, (desc, sev, icon) in enumerate(templates):
        affected_calls = random.sample(data.CALLS, k=6)
        affected_agents = list({c["agent_name"] for c in affected_calls})[:4]
        out.append({
            "id": f"find{i+1}",
            "icon": icon,
            "severity": sev,
            "description": desc,
            "affected_calls": [c["id"] for c in affected_calls],
            "affected_agents": affected_agents,
        })
    return out