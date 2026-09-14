from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from ..database import get_db

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(32) PRIMARY KEY,
    incident VARCHAR(255) NOT NULL,
    agent VARCHAR(255) NOT NULL,
    queue VARCHAR(128) NOT NULL,
    time DATETIME NOT NULL,
    severity VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Open',
    assigned_to VARCHAR(255) NULL,
    call_id VARCHAR(64) NOT NULL,
    confidence INT DEFAULT 95,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

_TABLE_READY = False


def _ensure_table(db: Session):
    global _TABLE_READY
    if _TABLE_READY:
        return
    try:
        db.execute(text(CREATE_SQL))
        db.commit()
        _TABLE_READY = True
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to initialise alerts table")


def _seed_if_empty(db: Session):
    count = db.execute(text("SELECT COUNT(*) FROM alerts")).scalar()
    if count > 0:
        return

    from .. import data
    for alert in data.ALERTS:
        confidence = 95
        if alert.get("severity") == "Critical":
            confidence = 98
        elif alert.get("severity") == "High":
            confidence = 90
        elif alert.get("severity") == "Medium":
            confidence = 78

        db.execute(
            text("""
                INSERT IGNORE INTO alerts (id, incident, agent, queue, time, severity, status, assigned_to, call_id, confidence)
                VALUES (:id, :incident, :agent, :queue, :time, :severity, :status, :assigned_to, :call_id, :confidence)
            """),
            {
                "id": alert["id"],
                "incident": alert["incident"],
                "agent": alert["agent"],
                "queue": alert["queue"],
                "time": alert["time"],
                "severity": alert["severity"],
                "status": alert["status"],
                "assigned_to": alert.get("assigned_to"),
                "call_id": alert["call_id"],
                "confidence": confidence,
            },
        )
    db.commit()


def _row_to_dict(r):
    return {
        "id": r["id"],
        "incident": r["incident"],
        "agent": r["agent"],
        "queue": r["queue"],
        "time": str(r["time"]) if r["time"] else "",
        "severity": r["severity"],
        "status": r["status"],
        "assigned_to": r["assigned_to"],
        "call_id": r["call_id"],
        "confidence": r["confidence"],
    }


ALERT_CATEGORY_CONFIG = [
    {"label": "Abusive Language", "keywords": ["abuse", "abusive"], "icon": "AlertTriangle", "color": "#D14343"},
    {"label": "Compliance Violation", "keywords": ["compliance"], "icon": "ShieldAlert", "color": "#D14343"},
    {"label": "Customer Threat", "keywords": ["threat", "customer threat"], "icon": "Siren", "color": "#D14343"},
    {"label": "Dead Air", "keywords": ["dead air", "silent"], "icon": "VolumeX", "color": "#C9862B"},
    {"label": "Long Hold", "keywords": ["hold", "long hold"], "icon": "Clock", "color": "#C9862B"},
    {"label": "Script Deviation", "keywords": ["script"], "icon": "FileWarning", "color": "#C9862B"},
    {"label": "Sentiment Drop", "keywords": ["sentiment"], "icon": "TrendingDown", "color": "#3457D5"},
    {"label": "Data Privacy", "keywords": ["data", "pii", "leakage"], "icon": "Lock", "color": "#D14343"},
]


@router.get("")
def list_alerts(db: Session = Depends(get_db)):
    _ensure_table(db)
    _seed_if_empty(db)
    rows = db.execute(
        text("SELECT * FROM alerts ORDER BY time DESC")
    ).mappings().all()
    return [_row_to_dict(r) for r in rows]


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    _ensure_table(db)
    _seed_if_empty(db)
    rows = db.execute(text("SELECT incident FROM alerts")).mappings().all()
    all_incidents = [r["incident"].lower() for r in rows]
    result = []
    for cat in ALERT_CATEGORY_CONFIG:
        count = sum(
            1 for inc in all_incidents
            if any(kw in inc for kw in cat["keywords"])
        )
        result.append({
            "label": cat["label"],
            "count": count,
            "icon": cat["icon"],
            "color": cat["color"],
        })
    return result


@router.patch("/{alert_id}")
def update_alert(
    alert_id: str,
    status: Optional[str] = Body(None, embed=True),
    assigned_to: Optional[str] = Body(None, embed=True),
    db: Session = Depends(get_db),
):
    _ensure_table(db)
    existing = db.execute(
        text("SELECT id FROM alerts WHERE id = :id"), {"id": alert_id}
    ).mappings().one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Alert not found")

    fields = []
    params = {"id": alert_id}
    if status is not None:
        fields.append("status = :status")
        params["status"] = status
    if assigned_to is not None:
        fields.append("assigned_to = :assigned_to")
        params["assigned_to"] = assigned_to

    if fields:
        db.execute(text(f"UPDATE alerts SET {', '.join(fields)} WHERE id = :id"), params)
        db.commit()

    row = db.execute(
        text("SELECT * FROM alerts WHERE id = :id"), {"id": alert_id}
    ).mappings().one()
    return _row_to_dict(row)


@router.get("/sample-email/{alert_id}")
def sample_email(alert_id: str, db: Session = Depends(get_db)):
    _ensure_table(db)
    row = db.execute(
        text("SELECT * FROM alerts WHERE id = :id"), {"id": alert_id}
    ).mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {
        "subject": f"\U0001F6A8 Critical Call Quality Alert \u2013 Agent {row['agent']}",
        "recipients": ["Agent", "Reporting Manager", "Trainer", "Operations Manager", "Client Admin"],
        "body": {
            "agent": row["agent"],
            "call_id": row["call_id"],
            "severity": row["severity"],
            "detection": row["incident"],
            "confidence": f"{row['confidence']}%",
            "transcript_snippet": "You people don't understand anything...",
            "timestamp": str(row["time"]),
        },
    }
