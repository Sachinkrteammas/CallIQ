from typing import Optional
from fastapi import APIRouter, HTTPException, Body, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel

from .. import data
from ..database import get_db
from .auth import get_current_user

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


class IncidentCreate(BaseModel):
    incident_type: str
    severity: str = "Minor"
    call_id: Optional[str] = None
    agent_name: Optional[str] = None
    customer: Optional[str] = None
    project: Optional[str] = None
    queue: Optional[str] = None
    transcript_excerpt: Optional[str] = None
    assigned_to: Optional[str] = None


class FatalRuleCreate(BaseModel):
    name: str
    enabled: bool = True
    severity: str = "High"
    escalation_level: str = "1 Hour"


def _ensure_tables(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS incidents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            call_id VARCHAR(50),
            agent_name VARCHAR(255),
            customer VARCHAR(255),
            project VARCHAR(255),
            queue VARCHAR(255),
            incident_type VARCHAR(255) NOT NULL,
            severity VARCHAR(50) DEFAULT 'Minor',
            status VARCHAR(50) DEFAULT 'Open',
            assigned_to VARCHAR(255),
            transcript_excerpt TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS fatal_rules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            enabled BOOLEAN DEFAULT TRUE,
            severity VARCHAR(50) DEFAULT 'High',
            escalation_level VARCHAR(100) DEFAULT '1 Hour',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS incident_agents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL
        )
    """))
    db.commit()
    # Seed once if empty
    count = db.execute(text("SELECT COUNT(*) FROM incidents")).scalar()
    if count == 0:
        for inc in data.INCIDENTS:
            db.execute(text(
                "INSERT INTO incidents (call_id, agent_name, customer, project, queue, incident_type, severity, status, assigned_to) "
                "VALUES (:call_id, :agent_name, :customer, :project, :queue, :incident_type, :severity, :status, :assigned_to)"
            ), {
                "call_id": inc["call_id"],
                "agent_name": inc.get("agent_name"),
                "customer": inc.get("customer"),
                "project": inc.get("project"),
                "queue": inc.get("queue"),
                "incident_type": inc["incident_type"],
                "severity": inc["severity"],
                "status": inc["status"],
                "assigned_to": inc.get("assigned_to"),
            })
        db.commit()
    rcount = db.execute(text("SELECT COUNT(*) FROM fatal_rules")).scalar()
    if rcount == 0:
        for r in data.FATAL_RULES:
            db.execute(text(
                "INSERT INTO fatal_rules (name, enabled, severity, escalation_level) "
                "VALUES (:name, :enabled, :severity, :escalation_level)"
            ), {
                "name": r["name"],
                "enabled": r["enabled"],
                "severity": r["severity"],
                "escalation_level": r["escalation_level"],
            })
        db.commit()
    acount = db.execute(text("SELECT COUNT(*) FROM incident_agents")).scalar()
    if acount == 0:
        for a in data.AGENTS:
            db.execute(text("INSERT INTO incident_agents (name) VALUES (:name)"), {"name": a["name"] if isinstance(a, dict) else a})
        db.commit()


def _incident_row(row):
    return {
        "id": row[0],
        "call_id": row[1],
        "agent_name": row[2],
        "customer": row[3],
        "project": row[4],
        "queue": row[5],
        "incident_type": row[6],
        "severity": row[7],
        "status": row[8],
        "assigned_to": row[9],
        "transcript_excerpt": row[10],
        "created_at": str(row[11]) if row[11] else None,
    }


def _rule_row(row):
    return {
        "id": row[0],
        "name": row[1],
        "enabled": bool(row[2]),
        "severity": row[3],
        "escalation_level": row[4],
    }


@router.get("")
def list_incidents(
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _ensure_tables(db)
    sql = "SELECT id, call_id, agent_name, customer, project, queue, incident_type, severity, status, assigned_to, transcript_excerpt, created_at FROM incidents"
    conds = []
    params = {}
    if severity:
        conds.append("severity = :sev")
        params["sev"] = severity
    if status and status != "All":
        conds.append("status = :st")
        params["st"] = status
    if conds:
        sql += " WHERE " + " AND ".join(conds)
    sql += " ORDER BY id DESC"
    rows = db.execute(text(sql), params).fetchall()
    return [_incident_row(r) for r in rows]


@router.post("")
def create_incident(req: IncidentCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _ensure_tables(db)
    res = db.execute(text(
        "INSERT INTO incidents (call_id, agent_name, customer, project, queue, incident_type, severity, status, transcript_excerpt, assigned_to) "
        "VALUES (:call_id, :agent_name, :customer, :project, :queue, :incident_type, :severity, 'Open', :transcript_excerpt, :assigned_to)"
    ), {
        "call_id": req.call_id,
        "agent_name": req.agent_name,
        "customer": req.customer,
        "project": req.project,
        "queue": req.queue,
        "incident_type": req.incident_type,
        "severity": req.severity,
        "transcript_excerpt": req.transcript_excerpt,
        "assigned_to": req.assigned_to,
    })
    db.commit()
    new_id = res.lastrowid
    row = db.execute(text(
        "SELECT id, call_id, agent_name, customer, project, queue, incident_type, severity, status, assigned_to, transcript_excerpt, created_at FROM incidents WHERE id = :id"
    ), {"id": new_id}).fetchone()
    return _incident_row(row)


@router.patch("/{incident_id}")
def update_incident(
    incident_id: int,
    status: Optional[str] = Body(None),
    assigned_to: Optional[str] = Body(None),
    severity: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _ensure_tables(db)
    row = db.execute(text("SELECT * FROM incidents WHERE id = :id"), {"id": incident_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")
    fields = []
    params = {"id": incident_id}
    if status is not None:
        fields.append("status = :status")
        params["status"] = status
    if assigned_to is not None:
        fields.append("assigned_to = :assigned_to")
        params["assigned_to"] = assigned_to
    if severity is not None:
        fields.append("severity = :severity")
        params["severity"] = severity
    if fields:
        db.execute(text(f"UPDATE incidents SET {', '.join(fields)} WHERE id = :id"), params)
        db.commit()
    updated = db.execute(text(
        "SELECT id, call_id, agent_name, customer, project, queue, incident_type, severity, status, assigned_to, transcript_excerpt, created_at FROM incidents WHERE id = :id"
    ), {"id": incident_id}).fetchone()
    return _incident_row(updated)


@router.delete("/{incident_id}")
def delete_incident(incident_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _ensure_tables(db)
    row = db.execute(text("SELECT * FROM incidents WHERE id = :id"), {"id": incident_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")
    db.execute(text("DELETE FROM incidents WHERE id = :id"), {"id": incident_id})
    db.commit()
    return {"deleted": incident_id}


@router.get("/fatal-rules/all")
def get_fatal_rules(db: Session = Depends(get_db), user=Depends(get_current_user)):
    _ensure_tables(db)
    rows = db.execute(text("SELECT id, name, enabled, severity, escalation_level FROM fatal_rules ORDER BY id")).fetchall()
    return [_rule_row(r) for r in rows]


@router.post("/fatal-rules")
def create_fatal_rule(req: FatalRuleCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _ensure_tables(db)
    res = db.execute(text(
        "INSERT INTO fatal_rules (name, enabled, severity, escalation_level) VALUES (:name, :enabled, :severity, :escalation_level)"
    ), {
        "name": req.name,
        "enabled": req.enabled,
        "severity": req.severity,
        "escalation_level": req.escalation_level,
    })
    db.commit()
    new_id = res.lastrowid
    row = db.execute(text("SELECT id, name, enabled, severity, escalation_level FROM fatal_rules WHERE id = :id"), {"id": new_id}).fetchone()
    return _rule_row(row)


@router.patch("/fatal-rules/{rule_id}")
def update_fatal_rule(
    rule_id: int,
    enabled: Optional[bool] = Body(None),
    severity: Optional[str] = Body(None),
    escalation_level: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _ensure_tables(db)
    row = db.execute(text("SELECT * FROM fatal_rules WHERE id = :id"), {"id": rule_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    fields = []
    params = {"id": rule_id}
    if enabled is not None:
        fields.append("enabled = :enabled")
        params["enabled"] = enabled
    if severity is not None:
        fields.append("severity = :severity")
        params["severity"] = severity
    if escalation_level is not None:
        fields.append("escalation_level = :escalation_level")
        params["escalation_level"] = escalation_level
    if fields:
        db.execute(text(f"UPDATE fatal_rules SET {', '.join(fields)} WHERE id = :id"), params)
        db.commit()
    updated = db.execute(text("SELECT id, name, enabled, severity, escalation_level FROM fatal_rules WHERE id = :id"), {"id": rule_id}).fetchone()
    return _rule_row(updated)


@router.delete("/fatal-rules/{rule_id}")
def delete_fatal_rule(rule_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _ensure_tables(db)
    row = db.execute(text("SELECT * FROM fatal_rules WHERE id = :id"), {"id": rule_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.execute(text("DELETE FROM fatal_rules WHERE id = :id"), {"id": rule_id})
    db.commit()
    return {"deleted": rule_id}


@router.get("/agents")
def list_agents(db: Session = Depends(get_db), user=Depends(get_current_user)):
    _ensure_tables(db)
    rows = db.execute(text("SELECT name FROM incident_agents ORDER BY name")).fetchall()
    return [r[0] for r in rows]
