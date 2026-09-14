import random
from fastapi import APIRouter
from .. import data

router = APIRouter(prefix="/api/conversation", tags=["conversation"])


@router.get("/distribution")
def distribution():
    random.seed(21)

    def spark(base, n=10):
        return [round(base + random.uniform(-4, 4), 1) for _ in range(n)]

    cards = [
        {"label": "Dead Air", "value": 8.4, "unit": "%", "trend": 3.8, "spark": spark(8)},
        {"label": "Long Hold", "value": 12.1, "unit": "%", "trend": 5.1, "spark": spark(12)},
        {"label": "Frequent Interruptions", "value": 3.6, "unit": "/call", "trend": 4.4, "spark": spark(3.6)},
        {"label": "Customer Talking %", "value": 46.2, "unit": "%", "trend": -1.2, "spark": spark(46)},
        {"label": "Agent Talking %", "value": 41.8, "unit": "%", "trend": 0.8, "spark": spark(42)},
        {"label": "Silence %", "value": 12.0, "unit": "%", "trend": 2.0, "spark": spark(12)},
        {"label": "Cross Talk %", "value": 6.3, "unit": "%", "trend": -0.6, "spark": spark(6)},
        {"label": "Escalation", "value": 9.7, "unit": "%", "trend": 2.9, "spark": spark(9.7)},
    ]
    return cards


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
