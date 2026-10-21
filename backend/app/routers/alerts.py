from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from .auth import get_current_user

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

# ═══════════════════════════════════════════════════════════
# ONLY 5 ALLOWED ALERT CATEGORIES (client feedback)
# ═══════════════════════════════════════════════════════════
ALLOWED_CATEGORIES = [
    "Abusive Language",
    "Compliance Violation",
    "Customer Threat",
    "Data Privacy Breach",
    "Policy Violation",
]


def _ensure_table(db: Session):
    """Table already exists — but ensure columns match."""
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS alerts (
                id VARCHAR(32) PRIMARY KEY,
                incident VARCHAR(255) NOT NULL,
                agent VARCHAR(255) NOT NULL,
                queue VARCHAR(128) NOT NULL,
                time DATETIME NOT NULL,
                severity VARCHAR(32) NOT NULL,
                status VARCHAR(32) DEFAULT 'Open',
                assigned_to VARCHAR(255),
                call_id VARCHAR(64) NOT NULL,
                confidence INT DEFAULT 95,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.commit()
    except Exception:
        pass


@router.get("/categories")
def list_categories(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return ALLOWED_CATEGORIES


@router.get("")
def list_alerts(
    status: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _ensure_table(db)

    # Build query using actual column names
    where = ["1=1"]
    params = {}

    if status and status != 'All':
        where.append("status = :st")
        params["st"] = status

    if category and category in ALLOWED_CATEGORIES:
        where.append("incident = :cat")
        params["cat"] = category

    # Only allowed categories
    allowed = ",".join([f"'{c}'" for c in ALLOWED_CATEGORIES])
    where.append(f"incident IN ({allowed})")

    wc = " AND ".join(where)

    try:
        rows = db.execute(text(f"""
            SELECT id, incident, agent, queue, time, severity, status,
                   assigned_to, call_id, confidence, created_at
            FROM alerts
            WHERE {wc}
            ORDER BY time DESC
            LIMIT 500
        """), params).mappings().all()
    except Exception as e:
        print(f"[alerts] query failed: {e}")
        return []

    # Map to frontend expected structure
    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "incident_id": None,  # not in table
            "call_id": r.get("call_id"),
            "category": r.get("incident") or "Unknown",
            "severity": r.get("severity") or "Medium",
            "agent_name": r.get("agent"),
            "message": f"Queue: {r.get('queue', 'N/A')} · Confidence: {r.get('confidence', 95)}%",
            "channel": "In-App",
            "status": r.get("status") or "Open",
            "created_at": str(r.get("time")) if r.get("time") else None,
            "queue": r.get("queue"),
            "confidence": r.get("confidence"),
            "assigned_to": r.get("assigned_to"),
        })
    return result


@router.patch("/{alert_id}")
def update_alert(
    alert_id: str,
    status: Optional[str] = Body(None),
    assigned_to: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _ensure_table(db)

    fields = []
    params = {"id": alert_id}

    if status is not None:
        fields.append("status = :st")
        params["st"] = status
    if assigned_to is not None:
        fields.append("assigned_to = :at")
        params["at"] = assigned_to

    if fields:
        db.execute(text(f"UPDATE alerts SET {', '.join(fields)} WHERE id = :id"), params)
        db.commit()

    return {"updated": alert_id}


@router.get("/sample-email/{alert_id}")
def get_sample_email(alert_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _ensure_table(db)

    row = db.execute(text("""
        SELECT id, incident, agent, queue, time, severity, status,
               assigned_to, call_id, confidence
        FROM alerts WHERE id = :id
    """), {"id": alert_id}).mappings().one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Alert not found")

    subject = f"🚨 {row['severity']} Alert: {row['incident']}"
    body = f"""Alert Category: {row['incident']}
Severity: {row['severity']}
Agent: {row['agent']}
Queue: {row['queue']}
Call ID: {row['call_id']}
Confidence: {row['confidence']}%
Status: {row['status']}
Time: {row['time']}
Assigned To: {row.get('assigned_to') or 'Unassigned'}

This is an automated alert from CallIQ."""

    return {"subject": subject, "body": body}