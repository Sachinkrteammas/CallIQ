from fastapi import APIRouter, HTTPException, Body, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from pydantic import BaseModel
import json

from ..database import get_db
from .auth import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _ensure_tables(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS workspace_settings (
            id INT PRIMARY KEY DEFAULT 1,
            workspace_name VARCHAR(255) DEFAULT 'Acme BPO',
            timezone VARCHAR(100) DEFAULT 'Asia/Kolkata (GMT+5:30)',
            default_language VARCHAR(50) DEFAULT 'English',
            date_format VARCHAR(50) DEFAULT 'DD MMM YYYY',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS settings_integrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            type VARCHAR(100) NOT NULL,
            icon VARCHAR(50) DEFAULT 'Link',
            status VARCHAR(20) DEFAULT 'Disconnected',
            config JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS settings_notifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            trigger_name VARCHAR(255) NOT NULL,
            channels JSON,
            frequency VARCHAR(100),
            enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS settings_security (
            id INT PRIMARY KEY DEFAULT 1,
            two_factor_auth BOOLEAN DEFAULT TRUE,
            session_timeout BOOLEAN DEFAULT TRUE,
            ip_whitelisting BOOLEAN DEFAULT FALSE,
            audit_logging BOOLEAN DEFAULT TRUE,
            data_encryption BOOLEAN DEFAULT TRUE,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """))
    db.commit()


def _seed_defaults(db: Session):
    db.execute(text("""
        INSERT IGNORE INTO workspace_settings (id, workspace_name, timezone, default_language, date_format)
        VALUES (1, 'Acme BPO', 'Asia/Kolkata (GMT+5:30)', 'English', 'DD MMM YYYY')
    """))
    db.execute(text("""
        INSERT IGNORE INTO settings_security (id, two_factor_auth, session_timeout, ip_whitelisting, audit_logging, data_encryption)
        VALUES (1, TRUE, TRUE, FALSE, TRUE, TRUE)
    """))
    count = db.execute(text("SELECT COUNT(*) FROM settings_integrations")).scalar()
    if count == 0:
        for name, typ, icon, status in [
            ('Twilio', 'Telephony', 'Phone', 'Connected'),
            ('Slack', 'Notifications', 'MessageSquare', 'Connected'),
            ('Salesforce', 'CRM', 'Database', 'Connected'),
            ('Zendesk', 'Ticketing', 'Ticket', 'Disconnected'),
            ('AWS S3', 'Storage', 'Cloud', 'Connected'),
            ('Google Workspace', 'Email', 'Mail', 'Connected'),
        ]:
            db.execute(text(
                "INSERT INTO settings_integrations (name, type, icon, status) VALUES (:n, :t, :i, :s)"
            ), {"n": name, "t": typ, "i": icon, "s": status})
    count = db.execute(text("SELECT COUNT(*) FROM settings_notifications")).scalar()
    if count == 0:
        for trigger, channels, freq, enabled in [
            ('Critical Incident Detected', '["Email","Slack","SMS"]', 'Immediate', True),
            ('Agent Score Drops Below 60', '["Email","Slack"]', 'Immediate', True),
            ('Compliance Violation', '["Email"]', 'Immediate', True),
            ('Daily Summary Report', '["Email"]', 'Daily 6 PM', True),
            ('Weekly Executive Report', '["Email"]', 'Monday 8 AM', True),
            ('Escalation Threshold Breach', '["Email","Slack","SMS"]', 'Immediate', False),
        ]:
            db.execute(text(
                "INSERT INTO settings_notifications (trigger_name, channels, frequency, enabled) VALUES (:tr, :ch, :fr, :en)"
            ), {"tr": trigger, "ch": channels, "fr": freq, "en": enabled})
    db.commit()


def _init_settings(db: Session):
    _ensure_tables(db)
    _seed_defaults(db)


# ─── Workspace ───────────────────────────────────────────────────────────

@router.get("/workspace")
def get_workspace(user=Depends(get_current_user), db: Session = Depends(get_db)):
    _init_settings(db)
    row = db.execute(text("SELECT * FROM workspace_settings WHERE id = 1")).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Workspace settings not found")
    m = row._mapping
    return {
        "workspace_name": m["workspace_name"],
        "timezone": m["timezone"],
        "default_language": m["default_language"],
        "date_format": m["date_format"],
    }


class WorkspaceUpdate(BaseModel):
    workspace_name: Optional[str] = None
    timezone: Optional[str] = None
    default_language: Optional[str] = None
    date_format: Optional[str] = None


@router.put("/workspace")
def update_workspace(req: WorkspaceUpdate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    _init_settings(db)
    fields = []
    vals = {}
    if req.workspace_name is not None:
        fields.append("workspace_name = :wn")
        vals["wn"] = req.workspace_name
    if req.timezone is not None:
        fields.append("timezone = :tz")
        vals["tz"] = req.timezone
    if req.default_language is not None:
        fields.append("default_language = :dl")
        vals["dl"] = req.default_language
    if req.date_format is not None:
        fields.append("date_format = :df")
        vals["df"] = req.date_format
    if fields:
        db.execute(text(f"UPDATE workspace_settings SET {', '.join(fields)} WHERE id = 1"), vals)
        db.commit()
    row = db.execute(text("SELECT * FROM workspace_settings WHERE id = 1")).fetchone()
    m = row._mapping
    return {
        "workspace_name": m["workspace_name"],
        "timezone": m["timezone"],
        "default_language": m["default_language"],
        "date_format": m["date_format"],
    }


# ─── Users ───────────────────────────────────────────────────────────────

USER_ROLES = ["System Admin", "Team Lead", "QA Analyst", "Agent", "Operations Manager", "User"]


def _ensure_user_role_column(db: Session):
    # Add role column if missing
    col = db.execute(text(
        "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'"
    )).scalar()
    if col == 0:
        db.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'User'"))
        db.execute(text("UPDATE users SET role = CASE WHEN is_superuser = 1 THEN 'System Admin' ELSE 'User' END"))
        db.commit()
    # Add full_name column if missing
    fn = db.execute(text(
        "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'full_name'"
    )).scalar()
    if fn == 0:
        db.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR(255)"))
        db.execute(text(
            "UPDATE users SET full_name = NULL WHERE full_name IS NULL"
        ))
        db.commit()


def _user_row(m):
    raw_role = m.get("role")
    if not raw_role:
        raw_role = "System Admin" if m["is_superuser"] else "User"
    return {
        "id": m["id"],
        "email": m["email"],
        "full_name": m.get("full_name") or m["email"].split("@")[0].replace(".", " ").title(),
        "role": raw_role,
        "status": "Active" if m["is_active"] else "Inactive",
        "is_superuser": bool(m["is_superuser"]),
        "is_admin": bool(m["is_superuser"]) or raw_role == "System Admin",
        "client_id": m["client_id"],
        "created_at": str(m["created_at"]) if m.get("created_at") else None,
    }


class UserCreate(BaseModel):
    full_name: str = ""
    email: str
    password: str = ""
    role: str = "Agent"
    client_id: Optional[int] = None


@router.get("/users")
def list_users(role: Optional[str] = None, user=Depends(get_current_user), db: Session = Depends(get_db)):
    _ensure_user_role_column(db)
    sql = "SELECT id, email, full_name, is_active, is_superuser, role, client_id, created_at FROM users"
    params = {}
    if role and role != "All":
        sql += " WHERE role = :role"
        params["role"] = role
    sql += " ORDER BY id"
    rows = db.execute(text(sql), params).fetchall()
    return [_user_row(r._mapping) for r in rows]


@router.post("/users")
def create_user(req: UserCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Only admins can create users")
    _ensure_user_role_column(db)

    email = (req.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if not req.password:
        raise HTTPException(status_code=400, detail="Password is required")

    exists = db.execute(text("SELECT id FROM users WHERE email = :e"), {"e": email}).fetchone()
    if exists:
        raise HTTPException(status_code=400, detail="Email already exists")

    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt_sha256", "bcrypt"], deprecated="auto")
    hashed = pwd_context.hash(req.password)

    role = req.role or "Agent"
    is_admin = 1 if role in ("System Admin", "Operations Manager") else 0
    full_name = (req.full_name or "").strip() or email.split("@")[0].replace(".", " ").title()

    db.execute(text("""
        INSERT INTO users (email, password_hash, full_name, role, is_active, is_superuser, client_id, created_at)
        VALUES (:email, :hash, :fn, :role, 1, :admin, :ci, NOW())
    """), {
        "email": email, "hash": hashed, "fn": full_name,
        "role": role, "admin": is_admin, "ci": req.client_id or None,
    })
    db.commit()
    row = db.execute(text(
        "SELECT id, email, full_name, is_active, is_superuser, role, client_id, created_at FROM users WHERE email = :e"
    ), {"e": email}).fetchone()
    return _user_row(row._mapping)


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


@router.put("/users/{user_id}")
def update_user(user_id: int, req: UserUpdate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Only admins can update users")
    _ensure_user_role_column(db)
    existing = db.execute(text("SELECT id FROM users WHERE id = :id"), {"id": user_id}).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    fields = []
    vals = {"id": user_id}
    if req.full_name is not None:
        fields.append("full_name = :fn")
        vals["fn"] = req.full_name
    if req.is_active is not None:
        fields.append("is_active = :ia")
        vals["ia"] = 1 if req.is_active else 0
    if req.role is not None:
        is_admin = 1 if req.role in ("System Admin", "Operations Manager") else 0
        fields.append("role = :role")
        fields.append("is_superuser = :su")
        vals["role"] = req.role
        vals["su"] = is_admin
    if fields:
        db.execute(text(f"UPDATE users SET {', '.join(fields)} WHERE id = :id"), vals)
        db.commit()
    return {"message": "User updated"}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Only admins can delete users")
    existing = db.execute(text("SELECT id FROM users WHERE id = :id"), {"id": user_id}).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    db.commit()
    return {"message": "User deleted"}


# ─── Notifications ───────────────────────────────────────────────────────

@router.get("/notifications")
def get_notifications(user=Depends(get_current_user), db: Session = Depends(get_db)):
    _init_settings(db)
    rows = db.execute(text("SELECT * FROM settings_notifications ORDER BY id")).fetchall()
    rules = []
    for r in rows:
        m = r._mapping
        channels = m["channels"]
        if isinstance(channels, str):
            try:
                channels = json.loads(channels)
            except (json.JSONDecodeError, TypeError):
                channels = []
        rules.append({
            "id": m["id"],
            "trigger": m["trigger_name"],
            "channels": channels or [],
            "frequency": m["frequency"],
            "enabled": bool(m["enabled"]),
        })
    return rules


class NotificationCreate(BaseModel):
    trigger: str
    channels: List[str]
    frequency: str
    enabled: bool = True


@router.post("/notifications")
def add_notification(req: NotificationCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    _init_settings(db)
    db.execute(text(
        "INSERT INTO settings_notifications (trigger_name, channels, frequency, enabled) VALUES (:tr, :ch, :fr, :en)"
    ), {"tr": req.trigger, "ch": json.dumps(req.channels), "fr": req.frequency, "en": req.enabled})
    db.commit()
    row = db.execute(text("SELECT LAST_INSERT_ID() as lid")).fetchone()
    new_id = row._mapping["lid"]
    return {"id": new_id, "trigger": req.trigger, "channels": req.channels, "frequency": req.frequency, "enabled": req.enabled}


class NotificationUpdate(BaseModel):
    trigger: Optional[str] = None
    channels: Optional[List[str]] = None
    frequency: Optional[str] = None
    enabled: Optional[bool] = None


@router.put("/notifications/{rule_id}")
def update_notification(rule_id: int, req: NotificationUpdate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    _init_settings(db)
    existing = db.execute(text("SELECT id FROM settings_notifications WHERE id = :id"), {"id": rule_id}).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Notification rule not found")
    fields = []
    vals = {"id": rule_id}
    if req.trigger is not None:
        fields.append("trigger_name = :tr")
        vals["tr"] = req.trigger
    if req.channels is not None:
        fields.append("channels = :ch")
        vals["ch"] = json.dumps(req.channels)
    if req.frequency is not None:
        fields.append("frequency = :fr")
        vals["fr"] = req.frequency
    if req.enabled is not None:
        fields.append("enabled = :en")
        vals["en"] = req.enabled
    if fields:
        db.execute(text(f"UPDATE settings_notifications SET {', '.join(fields)} WHERE id = :id"), vals)
        db.commit()
    return {"message": "Notification rule updated"}


@router.delete("/notifications/{rule_id}")
def delete_notification(rule_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    _init_settings(db)
    existing = db.execute(text("SELECT id FROM settings_notifications WHERE id = :id"), {"id": rule_id}).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Notification rule not found")
    db.execute(text("DELETE FROM settings_notifications WHERE id = :id"), {"id": rule_id})
    db.commit()
    return {"message": "Notification rule deleted"}


# ─── Integrations ────────────────────────────────────────────────────────

@router.get("/integrations")
def get_integrations(user=Depends(get_current_user), db: Session = Depends(get_db)):
    _init_settings(db)
    rows = db.execute(text("SELECT * FROM settings_integrations ORDER BY id")).fetchall()
    integrations = []
    for r in rows:
        m = r._mapping
        integrations.append({
            "id": m["id"],
            "name": m["name"],
            "type": m["type"],
            "icon": m["icon"],
            "status": m["status"],
        })
    return integrations


class IntegrationCreate(BaseModel):
    name: str
    type: str
    icon: str = "Link"
    status: str = "Disconnected"


@router.post("/integrations")
def add_integration(req: IntegrationCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Only admins can add integrations")
    _init_settings(db)
    db.execute(text(
        "INSERT INTO settings_integrations (name, type, icon, status) VALUES (:n, :t, :i, :s)"
    ), {"n": req.name, "t": req.type, "i": req.icon, "s": req.status})
    db.commit()
    row = db.execute(text("SELECT LAST_INSERT_ID() as lid")).fetchone()
    new_id = row._mapping["lid"]
    return {"id": new_id, "name": req.name, "type": req.type, "icon": req.icon, "status": req.status}


class IntegrationUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    icon: Optional[str] = None
    status: Optional[str] = None


@router.put("/integrations/{intg_id}")
def update_integration(intg_id: int, req: IntegrationUpdate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Only admins can update integrations")
    _init_settings(db)
    existing = db.execute(text("SELECT id FROM settings_integrations WHERE id = :id"), {"id": intg_id}).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Integration not found")
    fields = []
    vals = {"id": intg_id}
    if req.name is not None:
        fields.append("name = :n")
        vals["n"] = req.name
    if req.type is not None:
        fields.append("type = :t")
        vals["t"] = req.type
    if req.icon is not None:
        fields.append("icon = :i")
        vals["i"] = req.icon
    if req.status is not None:
        fields.append("status = :s")
        vals["s"] = req.status
    if fields:
        db.execute(text(f"UPDATE settings_integrations SET {', '.join(fields)} WHERE id = :id"), vals)
        db.commit()
    return {"message": "Integration updated"}


@router.delete("/integrations/{intg_id}")
def delete_integration(intg_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Only admins can delete integrations")
    _init_settings(db)
    existing = db.execute(text("SELECT id FROM settings_integrations WHERE id = :id"), {"id": intg_id}).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Integration not found")
    db.execute(text("DELETE FROM settings_integrations WHERE id = :id"), {"id": intg_id})
    db.commit()
    return {"message": "Integration deleted"}


# ─── Security ────────────────────────────────────────────────────────────

@router.get("/security")
def get_security(user=Depends(get_current_user), db: Session = Depends(get_db)):
    _init_settings(db)
    row = db.execute(text("SELECT * FROM settings_security WHERE id = 1")).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Security settings not found")
    m = row._mapping
    return {
        "two_factor_auth": bool(m["two_factor_auth"]),
        "session_timeout": bool(m["session_timeout"]),
        "ip_whitelisting": bool(m["ip_whitelisting"]),
        "audit_logging": bool(m["audit_logging"]),
        "data_encryption": bool(m["data_encryption"]),
    }


class SecurityUpdate(BaseModel):
    two_factor_auth: Optional[bool] = None
    session_timeout: Optional[bool] = None
    ip_whitelisting: Optional[bool] = None
    audit_logging: Optional[bool] = None
    data_encryption: Optional[bool] = None


@router.put("/security")
def update_security(req: SecurityUpdate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    _init_settings(db)
    fields = []
    vals = {}
    if req.two_factor_auth is not None:
        fields.append("two_factor_auth = :tfa")
        vals["tfa"] = req.two_factor_auth
    if req.session_timeout is not None:
        fields.append("session_timeout = :st")
        vals["st"] = req.session_timeout
    if req.ip_whitelisting is not None:
        fields.append("ip_whitelisting = :ipw")
        vals["ipw"] = req.ip_whitelisting
    if req.audit_logging is not None:
        fields.append("audit_logging = :al")
        vals["al"] = req.audit_logging
    if req.data_encryption is not None:
        fields.append("data_encryption = :de")
        vals["de"] = req.data_encryption
    if fields:
        db.execute(text(f"UPDATE settings_security SET {', '.join(fields)} WHERE id = 1"), vals)
        db.commit()
    return {"message": "Security settings updated"}
