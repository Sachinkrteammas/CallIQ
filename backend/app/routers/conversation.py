import json
import random
from datetime import datetime, timedelta
from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import data
from ..database import get_db
from ..services.client_scope import get_client_type, normalize_client_type
from .auth import get_current_user

router = APIRouter(prefix="/api/conversation", tags=["conversation"])

HEATMAP_BEHAVIOURS = [
    "Dead Air",
    "Long Hold",
    "Interruptions",
    "Talk Ratio",
    "Silence",
    "Cross Talk",
    "Escalation",
    "Script Dev",
    "Sentiment",
]

# VAD thresholds used to colour a cell. These mirror the frontend VAD cards.
_HEATMAP_THRESHOLDS = {
    "Dead Air": ("dead_air", 5, 12, False),
    "Long Hold": ("long_hold", 10, 30, False),
    "Interruptions": ("interruptions", 3, 6, False),
    "Talk Ratio": ("talk_ratio", 65, 35, True),
    "Silence": ("silence", 10, 20, False),
    "Cross Talk": ("cross_talk", 3, 8, False),
    "Escalation": ("escalation", 5, 12, False),
    "Script Dev": ("script_deviation", 10, 25, False),
}


def _level(value, green_max, amber_max, inverse=False):
    """Classify a VAD metric. inverse=True means higher is better."""
    if value is None:
        return "green"
    if inverse:
        if value >= green_max:
            return "green"
        return "amber" if value >= amber_max else "red"
    if value <= green_max:
        return "green"
    return "amber" if value <= amber_max else "red"


def _as_names(value):
    """Normalize a CSV string / JSON list of configured process names."""
    if not value:
        return []
    if isinstance(value, (list, tuple, set)):
        raw = list(value)
    elif isinstance(value, str):
        try:
            parsed = json.loads(value)
            raw = parsed if isinstance(parsed, (list, tuple)) else [value]
        except (ValueError, TypeError):
            raw = value.split(",")
    else:
        raw = [value]
    return [str(v).strip() for v in raw if str(v or "").strip()]


def _configured_processes(client, settings):
    """Process names are taken from saved client settings, then client config."""
    cfg = settings.get(int(client["id"])) or {}
    for key in ("ingroup_filter", "campaign_filter"):
        names = _as_names(cfg.get(key))
        if names:
            return names
    for key in ("ingroups", "campaigns"):
        names = _as_names(client.get(key))
        if names:
            return names
    return [client["name"]]


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
def heatmap(
    client_id: str = Query(default="all"),
    from_date: str = Query(default=None),
    to_date: str = Query(default=None),
    client_type: str = Query(default=None),
    view: str = Query(default="team", description="team=process, agent, queue"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Behaviour heatmap driven by configured process names and real audit/VAD data."""
    view = view if view in ("team", "agent", "queue") else "team"
    if not to_date:
        to_date = datetime.now().strftime("%Y-%m-%d")
    if not from_date:
        from_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

    # Client users are locked to their own client, exactly like other dashboards.
    if not user.get("is_admin"):
        client_id = str(user.get("client_id") or "all")
        client_type = None

    requested_type = normalize_client_type(client_type)
    client_filters = []
    client_params = {}
    selected_client_id = None
    if client_id and client_id != "all":
        try:
            selected_client_id = int(client_id)
        except (TypeError, ValueError):
            selected_client_id = None
        if selected_client_id is not None:
            actual_type = get_client_type(db, selected_client_id)
            if requested_type and actual_type and requested_type != actual_type:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Client {selected_client_id} is a {actual_type.title()} client "
                        f"and cannot be used in a {requested_type.title()} view."
                    ),
                )
            client_filters.append("id = :client_id")
            client_params["client_id"] = selected_client_id
    if not client_filters and requested_type:
        op = "=" if requested_type == "sales" else "!="
        client_filters.append(
            f"COALESCE(ingroups, '') {op} '' COLLATE utf8mb4_general_ci"
        )

    client_where = (" WHERE " + " AND ".join(client_filters)) if client_filters else ""
    clients = db.execute(
        text(f"SELECT id, name, campaigns, ingroups FROM clients{client_where} ORDER BY name"),
        client_params,
    ).mappings().all()
    if not clients:
        return {
            "behaviours": HEATMAP_BEHAVIOURS,
            "rows": [],
            "view": view,
            "from_date": from_date,
            "to_date": to_date,
        }

    settings_map = {}
    try:
        for row in db.execute(
            text("SELECT client_id, campaign_filter, ingroup_filter FROM client_settings")
        ).mappings().all():
            settings_map[int(row["client_id"])] = {
                "campaign_filter": row["campaign_filter"],
                "ingroup_filter": row["ingroup_filter"],
            }
    except Exception:
        settings_map = {}

    audit_filters = ["cl.start_time >= :from_date", "cl.start_time <= :to_date"]
    audit_params = {"from_date": from_date, "to_date": to_date + " 23:59:59"}
    if selected_client_id is not None:
        audit_filters.append("cl.client_id = :client_id")
        audit_params["client_id"] = selected_client_id
    elif requested_type:
        op = "=" if requested_type == "sales" else "!="
        audit_filters.append(
            f"cl.client_id IN (SELECT id FROM clients "
            f"WHERE COALESCE(ingroups, '') {op} '' COLLATE utf8mb4_general_ci)"
        )
    audit_where = " AND ".join(audit_filters)

    audit_rows = db.execute(
        text(f"""
            SELECT cl.client_id, cl.agent_id, cl.call_id, c.name AS client_name,
                   c.campaigns, c.ingroups, ca.percentage, ca.fatal_flag
            FROM call_logs cl
            LEFT JOIN clients c ON c.id = cl.client_id
            LEFT JOIN call_audits ca ON ca.call_id = cl.call_id
            WHERE {audit_where}
        """),
        audit_params,
    ).mappings().all()

    vad_filters = ["call_date BETWEEN :from_date AND :to_date"]
    vad_params = {"from_date": from_date, "to_date": to_date}
    if selected_client_id is not None:
        vad_filters.append("client_id = :client_id")
        vad_params["client_id"] = selected_client_id
    elif requested_type:
        op = "=" if requested_type == "sales" else "!="
        vad_filters.append(
            f"client_id IN (SELECT id FROM clients "
            f"WHERE COALESCE(ingroups, '') {op} '' COLLATE utf8mb4_general_ci)"
        )
    try:
        vad_rows = db.execute(
            text(f"""
                SELECT client_id, agent_id,
                       AVG(dead_air_pct) AS dead_air,
                       AVG(long_hold_sec) AS long_hold,
                       AVG(interruptions) AS interruptions,
                       AVG(talk_ratio_pct) AS talk_ratio,
                       AVG(silence_pct) AS silence,
                       AVG(cross_talk_pct) AS cross_talk,
                       AVG(escalation_pct) AS escalation,
                       AVG(script_deviation_pct) AS script_deviation
                FROM call_vad_metrics
                WHERE {' AND '.join(vad_filters)}
                GROUP BY client_id, agent_id
            """),
            vad_params,
        ).mappings().all()
    except Exception:
        vad_rows = []

    grouped = {}

    def add_row(label, row):
        group = grouped.setdefault(
            label, {"client_ids": set(), "agent_ids": set(), "rows": []}
        )
        group["client_ids"].add(int(row["client_id"]))
        if row["agent_id"]:
            group["agent_ids"].add(str(row["agent_id"]))
        group["rows"].append(row)

    def queue_label(client):
        campaigns = _as_names(client.get("campaigns"))
        return campaigns[0] if campaigns else client["name"]

    for row in audit_rows:
        client = next((c for c in clients if int(c["id"]) == int(row["client_id"])), None)
        if not client:
            continue
        if view == "agent":
            add_row(str(row["agent_id"] or "Unknown agent"), row)
        elif view == "queue":
            label = queue_label(client)
            add_row(label, row)
        else:
            # Team view is the process view: one row per configured process.
            for label in _configured_processes(client, settings_map):
                add_row(label, row)

    # Keep every configured process visible even when it has no audited calls.
    if view != "agent":
        for client in clients:
            labels = (
                [queue_label(client)]
                if view == "queue"
                else _configured_processes(client, settings_map)
            )
            for label in labels:
                group = grouped.setdefault(
                    label, {"client_ids": set(), "agent_ids": set(), "rows": []}
                )
                group["client_ids"].add(int(client["id"]))

    rows = []
    for label in sorted(grouped):
        group = grouped[label]
        group_rows = group["rows"]
        scores = [
            float(r["percentage"])
            for r in group_rows
            if r["percentage"] is not None
        ]
        avg_score = sum(scores) / len(scores) if scores else 100.0
        fatal_count = sum(1 for r in group_rows if r["fatal_flag"])

        relevant_vad = [
            r
            for r in vad_rows
            if r["client_id"] is not None
            and int(r["client_id"]) in group["client_ids"]
            and (
                not group["agent_ids"]
                or str(r["agent_id"] or "") in group["agent_ids"]
            )
        ]

        def average(key):
            values = []
            for r in relevant_vad:
                try:
                    if r[key] is not None:
                        values.append(float(r[key]))
                except (TypeError, ValueError, KeyError):
                    continue
            return sum(values) / len(values) if values else None

        metric_levels = {}
        for behaviour, (key, green, amber, inverse) in _HEATMAP_THRESHOLDS.items():
            metric_levels[behaviour] = _level(average(key), green, amber, inverse)

        cells = {}
        for behaviour in HEATMAP_BEHAVIOURS:
            if behaviour in metric_levels and metric_levels[behaviour] != "green":
                level = metric_levels[behaviour]
            elif behaviour == "Sentiment":
                level = "green" if avg_score >= 94 else ("amber" if avg_score >= 80 else "red")
            elif not group_rows:
                level = "green"
            elif fatal_count and behaviour in ("Escalation", "Script Dev"):
                level = "red"
            else:
                level = "green" if avg_score >= 94 else ("amber" if avg_score >= 80 else "red")
            cells[behaviour] = level

        rows.append({
            "team": label,
            "name": label,
            "client_id": min(group["client_ids"]) if group["client_ids"] else None,
            "calls": len(group_rows),
            "avg_score": round(avg_score, 1),
            "fatal_calls": fatal_count,
            "cells": cells,
        })

    return {
        "behaviours": HEATMAP_BEHAVIOURS,
        "rows": rows,
        "view": view,
        "from_date": from_date,
        "to_date": to_date,
    }


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