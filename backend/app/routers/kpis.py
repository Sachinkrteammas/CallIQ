import random
from fastapi import APIRouter
from .. import data

router = APIRouter(prefix="/api/kpis", tags=["kpis"])


def _kpi(label, value, unit, trend, key):
    return {"label": label, "value": value, "unit": unit, "trend": trend,
            "direction": "up" if trend >= 0 else "down", "key": key}


@router.get("/overview")
def overview():
    random.seed(11)
    quality = [
        _kpi("Calls Audited", len(data.CALLS), "", 6.4, "calls_audited"),
        _kpi("Average Score", round(sum(c["score"] for c in data.CALLS) / len(data.CALLS), 1), "%", 2.1, "avg_score"),
        _kpi("FCR", 78.4, "%", 1.8, "fcr"),
        _kpi("Critical Failures", sum(1 for c in data.CALLS if c["critical"]), "", -3.2, "critical_failures"),
        _kpi("Unclear Rate", 6.7, "%", -0.9, "unclear_rate"),
        _kpi("Late Opening", 9.2, "%", 1.4, "late_opening"),
        _kpi("Wrong Information", 4.1, "%", -1.1, "wrong_info"),
        _kpi("No Closing", 5.6, "%", 0.6, "no_closing"),
    ]
    ai_metrics = [
        _kpi("Dead Air %", round(sum(c["dead_air_pct"] for c in data.CALLS) / len(data.CALLS), 1), "%", 3.8, "dead_air"),
        _kpi("Average Hold Time", round(sum(c["hold_time_sec"] for c in data.CALLS) / len(data.CALLS) / 60, 1), "min", 4.5, "hold_time"),
        _kpi("Interruptions", round(sum(c["interruptions"] for c in data.CALLS) / len(data.CALLS), 1), "/call", 5.2, "interruptions"),
        _kpi("Customer Sentiment", round(sum(1 for c in data.CALLS if c["customer_sentiment"] == "Positive") / len(data.CALLS) * 100, 1), "%", -2.3, "customer_sentiment"),
        _kpi("Agent Sentiment", round(sum(1 for c in data.CALLS if c["agent_sentiment"] == "Positive") / len(data.CALLS) * 100, 1), "%", 1.1, "agent_sentiment"),
        _kpi("Escalation Risk", round(sum(1 for c in data.CALLS if c["escalated"]) / len(data.CALLS) * 100, 1), "%", 2.9, "escalation_risk"),
        _kpi("Abusive Calls", sum(1 for c in data.CALLS if c["abusive"]), "", 18.0, "abusive_calls"),
        _kpi("Silent Calls", sum(1 for c in data.CALLS if c["silent"]), "", 0.5, "silent_calls"),
        _kpi("Repeat Customers", 22.3, "%", -1.4, "repeat_customers"),
        _kpi("Compliance Risk", round(sum(1 for c in data.CALLS if c["compliance_violation"]) / len(data.CALLS) * 100, 1), "%", 2.0, "compliance_risk"),
    ]
    return {"quality": quality, "ai_metrics": ai_metrics}


@router.get("/health-score")
def health_score():
    return {
        "score": 76,
        "band": "amber",  # green >=80, amber 60-79, red <60
        "breakdown": [
            {"label": "Conversation Quality", "value": 81},
            {"label": "Customer Experience", "value": 72},
            {"label": "Compliance", "value": 68},
            {"label": "Communication", "value": 79},
            {"label": "Professionalism", "value": 84},
        ],
    }


@router.get("/insights")
def insights():
    return data.AI_INSIGHTS


@router.get("/trend")
def trend():
    return data.WEEKLY_TREND
