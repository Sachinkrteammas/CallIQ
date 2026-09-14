import json
import re
from datetime import datetime, timedelta
from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from .auth import get_current_user

router = APIRouter(prefix="/api/client", tags=["client-overview"])

clients_router = APIRouter(prefix="/api/clients", tags=["clients"])


@clients_router.get("/summary")
def all_clients_summary(
    from_date: str = Query(default=None),
    to_date: str = Query(default=None),
    client_type: str = Query(default=None, description="Sales or Service"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not to_date:
        to_date = datetime.now().strftime("%Y-%m-%d")
    if not from_date:
        from_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    type_clause, type_params = _client_type_clause(client_type)
    if not user.get("is_admin"):
        type_clause = "ca.client_id = :scope_cid AND "
        type_params = {"scope_cid": int(user.get("client_id") or 0)}
    params = {"from_date": from_date, "to_date": to_date, **type_params}

    calls_sql = text(f"""
        SELECT
            SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS critical_calls,
            SUM(CASE WHEN ca.percentage < 60 THEN 1 ELSE 0 END) AS compliance_violations,
            SUM(CASE WHEN ca.ranking IN ('Poor', 'Average') THEN 1 ELSE 0 END) AS pending_reviews
        FROM call_audits ca
        WHERE {type_clause}DATE(ca.created_at) BETWEEN :from_date AND :to_date
    """)
    row = db.execute(calls_sql, params).mappings().one()

    agents_sql = text(f"""
        SELECT
            COUNT(DISTINCT CASE WHEN t.agent_avg < 70 THEN t.agent_id END) AS needs_coaching,
            COUNT(DISTINCT CASE WHEN t.agent_avg < 65 THEN t.agent_id END) AS high_risk_agents
        FROM (
            SELECT ca.agent_id AS agent_id, AVG(ca.total_score) AS agent_avg
            FROM call_audits ca
            WHERE {type_clause}ca.agent_id IS NOT NULL AND ca.agent_id != ''
              AND DATE(ca.created_at) BETWEEN :from_date AND :to_date
            GROUP BY ca.agent_id
        ) t
    """)
    agent_row = db.execute(agents_sql, params).mappings().one()

    return {
        "from_date": from_date,
        "to_date": to_date,
        "critical_calls": row["critical_calls"] or 0,
        "needs_coaching": agent_row["needs_coaching"] or 0,
        "compliance_violations": row["compliance_violations"] or 0,
        "pending_reviews": row["pending_reviews"] or 0,
        "high_risk_agents": agent_row["high_risk_agents"] or 0,
    }


@clients_router.get("")
def list_active_clients(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.get("is_admin"):
        sql = text("""
            SELECT id, name,
                   CASE WHEN COALESCE(ingroups, '') = '' THEN 'Sales' ELSE 'Service' END AS client_type
            FROM clients
            WHERE is_active = 1
            ORDER BY name
        """)
        rows = db.execute(sql).mappings().all()
        return [{"id": row["id"], "name": row["name"], "type": row["client_type"]} for row in rows]

    cid = int(user.get("client_id") or 0)
    sql = text("""
        SELECT id, name,
               CASE WHEN COALESCE(ingroups, '') = '' THEN 'Sales' ELSE 'Service' END AS client_type
        FROM clients
        WHERE is_active = 1 AND id = :cid
        ORDER BY name
    """)
    rows = db.execute(sql, {"cid": cid}).mappings().all()
    return [{"id": row["id"], "name": row["name"], "type": row["client_type"]} for row in rows]


class ClientCreate(BaseModel):
    name: str = ""
    email: str = ""
    login_password: str = ""
    db_ip: str = ""
    dialer_user: str = ""
    dialer_pass: str = ""
    db_host: str = ""
    db_user: str = ""
    db_pass: str = ""
    campaigns: str = ""
    ingroups: str = ""


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    login_password: Optional[str] = None
    db_ip: Optional[str] = None
    dialer_user: Optional[str] = None
    dialer_pass: Optional[str] = None
    db_host: Optional[str] = None
    db_user: Optional[str] = None
    db_pass: Optional[str] = None
    campaigns: Optional[str] = None
    ingroups: Optional[str] = None


DEFAULT_AUDIT_PROMPT_TEXT = """\
You are an expert QA auditor for a customer-service contact center. Your job is to audit a \
transcribed call and return a structured JSON evaluation.

Rules:
1. Judge every point ONLY from the transcript. Never invent information.
2. Score each section on the given max_score and provide score, max_score and percentage \
(score / max_score * 100).
3. Set fatal_flag=true ONLY for severe violations such as abusive/profane language, threats, \
deliberately false information, disclosure of sensitive data/PII, fraud or a compliance-required \
statement missing.
4. Keep summary short and recommendations actionable.
5. Return ONLY a valid JSON object matching the schema below. No markdown, no extra text.

Sections to evaluate:
- opening (max 20): professional greeting, agent identification, purpose confirmation.
- communication (max 20): clarity, tone, active listening and empathy.
- probing_resolution (max 15): discovery questions and root-cause identification.
- process_compliance (max 25): compliance statement, script adherence and policy handling.
- closure (max 25): accurate resolution, next steps and professional closing.

Return exactly this JSON structure:
{
  "total_score": <int 0-100>,
  "percentage": <int 0-100>,
  "call_category": "<string>",
  "team": "<string>",
  "sections": {
    "opening": {"score": <int>, "max_score": 20, "percentage": <int>},
    "communication": {"score": <int>, "max_score": 20, "percentage": <int>},
    "probing_resolution": {"score": <int>, "max_score": 15, "percentage": <int>},
    "process_compliance": {"score": <int>, "max_score": 25, "percentage": <int>},
    "closure": {"score": <int>, "max_score": 25, "percentage": <int>}
  },
  "complaint_audit": {"request_raised": "yes"|"no", "request_classification": "<string>"},
  "conversion_audit": {"booking_done": "yes"|"no"},
  "registration_evaluation": {"status": "Full Registration"|"Partial"|"Other"},
  "sensitive_word": ["<phrase>"],
  "fatal_flag": <bool>,
  "hard_rule_failures": ["<description>"],
  "behaviours_detected": [
    {"label": "<string>", "severity": "Low"|"Medium"|"High"|"Critical", "evidence": "<quote from transcript>"}
  ],
  "recommendations": ["<coaching suggestion>"],
  "areas_for_improvement": ["<area to improve>"],
  "summary": "<2-3 sentence summary>"
}
"""


def _ensure_default_prompt_for_client(db: Session, client_id: int):
    """Create the ai_prompts table if missing and seed an ACTIVE default
    prompt for a client that does not have one yet."""
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_prompts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            client_id INT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            version VARCHAR(64) NULL,
            status VARCHAR(32) DEFAULT 'Draft',
            prompt_json JSON NOT NULL,
            prompt_text LONGTEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_ai_prompts_client (client_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """))
    existing = db.execute(
        text("SELECT id FROM ai_prompts WHERE client_id = :cid AND status = 'Active'"),
        {"cid": client_id},
    ).scalar()
    if not existing:
        db.execute(
            text("""
                INSERT INTO ai_prompts
                    (client_id, name, description, version, status, prompt_json, prompt_text, created_at, updated_at)
                VALUES
                    (:cid, 'Customer Service QA Audit Prompt', 'Default QA audit prompt created automatically.', 'v1.0', 'Active', '{}', :text, NOW(), NOW())
            """),
            {"cid": client_id, "text": DEFAULT_AUDIT_PROMPT_TEXT},
        )
        db.commit()


def _ensure_client_columns(db):
    """Add new columns to clients table if they don't exist."""
    try:
        cols = db.execute(text("SHOW COLUMNS FROM clients")).mappings().all()
        existing = {c["Field"] for c in cols}
    except Exception:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS clients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                dialer_ip VARCHAR(128) NOT NULL DEFAULT '',
                dialer_user VARCHAR(128) NOT NULL DEFAULT '',
                dialer_pass VARCHAR(255) NOT NULL DEFAULT '',
                db_host VARCHAR(128) NOT NULL DEFAULT '',
                db_user VARCHAR(128) NOT NULL DEFAULT '',
                db_pass VARCHAR(255) NOT NULL DEFAULT '',
                campaigns TEXT,
                ingroups TEXT,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.commit()
        existing = set()

    migrations = {
        "email": "ALTER TABLE clients ADD COLUMN email VARCHAR(255) DEFAULT ''",
        "login_password": "ALTER TABLE clients ADD COLUMN login_password VARCHAR(255) DEFAULT ''",
        "db_ip": "ALTER TABLE clients ADD COLUMN db_ip VARCHAR(100) DEFAULT ''",
        "dialer_user": "ALTER TABLE clients ADD COLUMN dialer_user VARCHAR(128) NOT NULL DEFAULT ''",
        "dialer_pass": "ALTER TABLE clients ADD COLUMN dialer_pass VARCHAR(255) NOT NULL DEFAULT ''",
        "dialer_ip": "ALTER TABLE clients ADD COLUMN dialer_ip VARCHAR(128) NOT NULL DEFAULT ''",
        "db_host": "ALTER TABLE clients ADD COLUMN db_host VARCHAR(128) NOT NULL DEFAULT ''",
        "db_user": "ALTER TABLE clients ADD COLUMN db_user VARCHAR(128) NOT NULL DEFAULT ''",
        "db_pass": "ALTER TABLE clients ADD COLUMN db_pass VARCHAR(255) NOT NULL DEFAULT ''",
        "campaigns": "ALTER TABLE clients ADD COLUMN campaigns TEXT",
        "ingroups": "ALTER TABLE clients ADD COLUMN ingroups TEXT",
    }
    for col, ddl in migrations.items():
        if col not in existing:
            try:
                db.execute(text(ddl))
            except Exception:
                pass
    db.commit()


_CLIENT_COLUMNS = "id, name, email, login_password, dialer_ip, dialer_user, dialer_pass, db_host, db_user, db_pass, campaigns, ingroups, is_active, created_at"


def _client_row_to_dict(m):
    """Map a clients row (by column name) to the API dict. DB IP = dialer_ip."""
    db_ip = m["dialer_ip"] or ""
    db_host = m["db_host"] or ""
    return {
        "id": m["id"],
        "name": m["name"],
        "email": m["email"] or "",
        "login_password": m["login_password"] or "",
        "db_ip": db_ip or db_host,
        "db_host": db_host or db_ip,
        "dialer_user": m["dialer_user"] or "",
        "dialer_pass": m["dialer_pass"] or "",
        "db_user": m["db_user"] or "",
        "db_pass": m["db_pass"] or "",
        "campaigns": m["campaigns"] or "",
        "ingroups": m["ingroups"] or "",
        "is_active": bool(m["is_active"]),
        "status": "Active" if m["is_active"] else "Inactive",
        "created_at": str(m["created_at"]) if m["created_at"] else "",
    }


@clients_router.get("/list")
def list_all_clients_full(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all clients with full details for the management table."""
    _ensure_client_columns(db)
    if user.get("is_admin"):
        sql = text(f"""
            SELECT {_CLIENT_COLUMNS}
            FROM clients
            ORDER BY created_at DESC
        """)
        rows = db.execute(sql).mappings().all()
    else:
        cid = int(user.get("client_id") or 0)
        sql = text(f"""
            SELECT {_CLIENT_COLUMNS}
            FROM clients
            WHERE id = :cid
            ORDER BY created_at DESC
        """)
        rows = db.execute(sql, {"cid": cid}).mappings().all()
    return [_client_row_to_dict(row) for row in rows]


@clients_router.get("/detail/{client_id}")
def get_client_detail(client_id: int, db: Session = Depends(get_db)):
    """Get single client details."""
    _ensure_client_columns(db)
    row = db.execute(
        text(f"SELECT {_CLIENT_COLUMNS} FROM clients WHERE id = :id"),
        {"id": client_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    return _client_row_to_dict(row._mapping)


@clients_router.post("")
def create_client(req: ClientCreate, db: Session = Depends(get_db)):
    """Create a new client."""
    _ensure_client_columns(db)
    try:
        result = db.execute(
            text("""
                INSERT INTO clients (name, email, login_password, dialer_ip, dialer_user, dialer_pass,
                                     db_host, db_user, db_pass, campaigns, ingroups, is_active, created_at)
                VALUES (:name, :email, :login_password, :db_ip, :dialer_user, :dialer_pass,
                        :db_host, :db_user, :db_pass, :campaigns, :ingroups, 1, NOW())
            """),
            {
                "name": req.name,
                "email": req.email,
                "login_password": req.login_password,
                "db_ip": req.db_ip,
                "dialer_user": req.dialer_user,
                "dialer_pass": req.dialer_pass,
                "db_host": req.db_host,
                "db_user": req.db_user,
                "db_pass": req.db_pass,
                "campaigns": req.campaigns,
                "ingroups": req.ingroups,
            },
        )
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create client. Check required fields.")
    db.commit()

    client_id = result.lastrowid
    _ensure_default_prompt_for_client(db, client_id)
    return {"id": client_id, "message": "Client created successfully"}


@clients_router.put("/{client_id}")
def update_client(client_id: int, req: ClientUpdate, db: Session = Depends(get_db)):
    """Update an existing client."""
    _ensure_client_columns(db)
    existing = db.execute(text("SELECT id FROM clients WHERE id = :id"), {"id": client_id}).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")

    updates = {}
    for field in ["name", "email", "login_password", "dialer_user", "dialer_pass",
                   "db_host", "db_user", "db_pass", "campaigns", "ingroups"]:
        val = getattr(req, field, None)
        if val is not None:
            updates[field] = val
    if req.db_ip is not None:
        updates["dialer_ip"] = req.db_ip

    if updates:
        set_clause = ", ".join(f"{k} = :{k}" for k in updates)
        updates["id"] = client_id
        db.execute(text(f"UPDATE clients SET {set_clause} WHERE id = :id"), updates)
        db.commit()

    return {"message": "Client updated successfully"}


@clients_router.delete("/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db)):
    """Delete a client."""
    existing = db.execute(text("SELECT id FROM clients WHERE id = :id"), {"id": client_id}).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    db.execute(text("DELETE FROM clients WHERE id = :id"), {"id": client_id})
    db.commit()
    return {"message": "Client deleted successfully"}


@clients_router.patch("/{client_id}/toggle-status")
def toggle_client_status(client_id: int, db: Session = Depends(get_db)):
    """Toggle client active/inactive status."""
    row = db.execute(text("SELECT id, is_active FROM clients WHERE id = :id"), {"id": client_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    new_status = 0 if row._mapping["is_active"] else 1
    db.execute(text("UPDATE clients SET is_active = :s WHERE id = :id"), {"s": new_status, "id": client_id})
    db.commit()
    return {"message": "Client status updated", "is_active": bool(new_status)}

FATAL_WORDS = [
    "abuse", "abusive", "bastard", "bitch", "crap", "damn", "fuck", "fucking",
    "idiot", "stupid", "moron", "shut up", "shutup", "get lost", "get lost",
    "bloody", "slut", "dick", "asshole", "bullshit", "piss", "retard",
    "son of a bitch", "screw you", "go to hell", "worst", "terrible",
    "useless", "incompetent", "disgusting", "pathetic", "loser",
]

FATAL_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in FATAL_WORDS) + r")\b",
    re.IGNORECASE,
)

_CALL_LOG_COLUMNS = None


def _call_log_columns(db) -> set:
    """Introspect call_logs columns once and cache them."""
    global _CALL_LOG_COLUMNS
    if _CALL_LOG_COLUMNS is None:
        try:
            rows = db.execute(text("SHOW COLUMNS FROM call_logs")).mappings().all()
            _CALL_LOG_COLUMNS = {r["Field"] for r in rows}
        except Exception:
            _CALL_LOG_COLUMNS = {"call_id", "transcript", "duration", "recording_path"}
    return _CALL_LOG_COLUMNS


_SPEAKER_LABEL_RE = re.compile(
    r"(?im)^\s*\[?\s*(?P<speaker>agent|customer)\s*\]?\s*[:：]\s*"
)


def _split_transcript(raw):
    """Split a raw transcript blob into speaker lines.

    Prefers explicit "agent:" / "customer:" labels. Falls back to splitting
    sentences and alternating agent / customer turns starting with the agent.
    """
    if not raw:
        return []
    raw = str(raw).strip()
    if not raw:
        return []

    matches = list(_SPEAKER_LABEL_RE.finditer(raw))
    if matches:
        lines = []
        for i, m in enumerate(matches):
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
            text = raw[start:end].strip()
            lines.append({"speaker": m.group("speaker").lower(), "text": text})
        if lines:
            return lines

    sentences = re.split(r"(?<=[.!?।])\s+", raw)
    lines = []
    for i, s in enumerate(sentences):
        s = s.strip()
        if not s:
            continue
        lines.append({"speaker": "agent" if i % 2 == 0 else "customer", "text": s})
    return lines or [{"speaker": "agent", "text": raw}]


_SILENCE_PATTERN = re.compile(
    r"^\[?\s*(silence|noise|paused|disconnect|call ended)\s*\]?\s*\.?\s*$",
    re.IGNORECASE,
)

_FRUSTRATED_WORDS = (
    "frust", "ridiculous", "worst", "nobody", "never", "not helping",
    "waste", "shout", "shouting", "angry", "horrible", "terrible",
)
_NEGATIVE_WORDS = (
    "charge", "charging", "refund", "complaint", "unable", "not resolved",
    "delay", "issue", "problem", "don't", "dont", "not working", "wrong",
)


def _emotion_for(text):
    low = (text or "").lower()
    if any(w in low for w in _FRUSTRATED_WORDS):
        return "frustrated"
    if any(w in low for w in _NEGATIVE_WORDS):
        return "negative"
    return "neutral"


def _annotate_transcript(lines, duration):
    """Add m:ss timestamps and an emotion tag to each speaker line."""
    duration = max(0, int(duration or 0))
    total = sum(len(l["text"]) for l in lines) or 1
    t = 0
    out = []
    for l in lines:
        text = (l["text"] or "").strip()
        if _SILENCE_PATTERN.match(text):
            text = ""
            secs = 6
        else:
            secs = max(2, round(len(text) / total * duration)) if duration else 8
            if duration and t + secs > duration:
                secs = max(2, duration - t)
        mm, ss = divmod(t, 60)
        out.append({
            "speaker": l["speaker"],
            "text": text,
            "time": f"{mm}:{ss:02d}",
            "emotion": _emotion_for(text),
        })
        t += secs
    return out


def _to_sec(time_str):
    parts = str(time_str or "0:00").split(":")
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return 0


def _derive_timeline(lines, duration):
    events = {"Greeting": "0:00"}
    for l in lines:
        low = l["text"].lower()
        if not l["text"].strip() and l["time"] != "0:00":
            events.setdefault("Dead Air", l["time"])
        elif l["speaker"] == "customer" and l["emotion"] in ("negative", "frustrated"):
            events.setdefault("Complaint", l["time"])
        if l["speaker"] == "agent" and any(
            w in low for w in ("transfer", "supervisor", "manager", "escalat")
        ):
            events.setdefault("Escalation", l["time"])
    if lines and events:
        events["Resolution"] = lines[-1]["time"]

    levels = {
        "Greeting": "green",
        "Resolution": "green",
        "Dead Air": "red",
        "Escalation": "red",
        "Complaint": "red",
        "Hold": "amber",
    }
    result = [
        {"time": t, "label": k, "level": levels.get(k, "info")}
        for k, t in events.items()
    ]
    result.sort(key=lambda e: _to_sec(e["time"]))
    return result


def _derive_behaviours(lines):
    behaviours = []

    for l in lines:
        if not l["text"].strip():
            behaviours.append({
                "label": f"Dead Air — silence at {l['time']}",
                "confidence": 94,
                "timestamp": l["time"],
                "severity": "High",
            })

    negatives = [l for l in lines if l["emotion"] in ("negative", "frustrated") and l["speaker"] == "customer"]
    if negatives:
        behaviours.append({
            "label": f"Customer Frustration — {len(negatives)} negative turns",
            "confidence": 90,
            "timestamp": negatives[0]["time"],
            "severity": "Critical",
        })
        if len(negatives) >= 2:
            behaviours.append({
                "label": "Escalation Risk — repeated customer negativity",
                "confidence": 88,
                "timestamp": negatives[1]["time"],
                "severity": "Critical",
            })

    defensive = [
        l for l in lines
        if l["speaker"] == "agent" and any(
            w in l["text"].lower()
            for w in ("don't shout", "do not shout", "not shouting", "calm down",
                      "i am trying", "please don't", "please dont")
        )
    ]
    if defensive:
        behaviours.append({
            "label": "Defensive Response — agent pushback",
            "confidence": 87,
            "timestamp": defensive[0]["time"],
            "severity": "High",
        })

    escalated = [
        l for l in lines
        if l["speaker"] == "agent" and any(
            w in l["text"].lower() for w in ("transfer", "supervisor", "manager", "escalat")
        )
    ]
    if escalated:
        behaviours.append({
            "label": "Failed Resolution — Transferred instead",
            "confidence": 91,
            "timestamp": escalated[0]["time"],
            "severity": "Critical",
        })

    greeting = lines[0]["text"].lower() if lines else ""
    if lines and not ("thank" in greeting and "calling" in greeting):
        behaviours.append({
            "label": "Missing Greeting Compliance",
            "confidence": 75,
            "timestamp": lines[0]["time"],
            "severity": "Low",
        })

    return behaviours


def _risk_level(fatal_flag, ranking, percentage, total_score):
    if fatal_flag:
        return "Critical"
    if isinstance(ranking, str) and ranking in ("Excellent", "Good"):
        return "Low"
    if percentage is not None:
        p = float(percentage)
    elif total_score is not None:
        p = float(total_score)
    else:
        p = 0
    if p >= 80:
        return "Low"
    if p >= 65:
        return "Medium"
    if p >= 50:
        return "High"
    return "Critical"


def _pct(sections, key):
    sec = sections.get(key) if isinstance(sections, dict) else None
    if sec is None:
        return None
    if isinstance(sec, (int, float)):
        return round(float(sec), 1)
    if not isinstance(sec, dict):
        return None
    score = sec.get("score", 0) or 0
    mx = sec.get("max_score", 0) or 0
    if not mx:
        return None
    return round(min(float(score) / float(mx) * 100, 100), 1)


def _build_scores(audit, overall):
    sections = audit.get("sections", {}) if isinstance(audit, dict) else {}
    opening = _pct(sections, "opening")
    comm = _pct(sections, "communication")
    process = _pct(sections, "process_compliance")
    closure = _pct(sections, "closure")
    base = [x for x in (opening, comm, process, closure) if x is not None]
    avg = round(sum(base) / len(base), 1) if base else round(float(overall or 0), 1)
    return {
        "overall": min(100.0, round(float(overall or 0), 1)),
        "professionalism": comm if comm is not None else avg,
        "empathy": opening if opening is not None else avg,
        "listening": avg,
        "confidence": avg,
        "compliance": process if process is not None else avg,
        "patience": avg,
        "resolution": closure if closure is not None else avg,
        "control": avg,
    }


def _coaching_recommendation(risk):
    if risk in ("High", "Critical"):
        return {
            "status": "Needs Coaching",
            "recommendation": ("Agent needs retraining on de-escalation techniques and "
                               "script adherence. Focus on active listening and empathy training."),
            "estimated_improvement": "+15% score improvement",
        }
    return {
        "status": "On Track",
        "recommendation": ("Continue reinforcing positive behaviour. Consider advanced "
                           "probing, objection handling and closure techniques."),
        "estimated_improvement": "+5% score improvement",
    }


def _parse_audit(row):
    raw = row.get("audit_json")
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not isinstance(raw, dict):
        raw = {}
    raw["_id"] = row.get("id")
    raw["_call_id"] = row.get("call_id", "")
    raw["_agent_id"] = row.get("agent_id", "")
    raw["_created_at"] = str(row.get("created_at", ""))
    raw["_duration"] = row.get("duration")
    raw["total_score"] = row.get("total_score", 0)
    raw["percentage"] = row.get("percentage", 0)
    raw["ranking"] = row.get("ranking", "Unknown")
    raw["fatal_flag"] = row.get("fatal_flag", False)
    raw["_recording_path"] = row.get("recording_path")
    raw["_agent_name"] = row.get("agent_name") or row.get("agent_id") or ""
    raw["_start_time"] = str(row.get("start_time") or "")
    raw["_end_time"] = str(row.get("end_time") or "")

    transcript = row.get("transcript") or ""
    agent_abusive_words = []
    if transcript:
        matches = FATAL_PATTERN.findall(transcript)
        agent_abusive_words = list(set(w.lower() for w in matches))
    raw["_transcript_abusive_words"] = agent_abusive_words
    raw["_is_transcript_fatal"] = len(agent_abusive_words) > 0

    return raw


def _avg(values):
    return round(sum(values) / len(values), 1) if values else 0


def _section_avg(audits, section):
    scores = []
    max_scores = []
    percentages = []
    for a in audits:
        sec = a.get("sections", {}).get(section)
        if not isinstance(sec, dict):
            continue
        s = sec.get("score", 0) or 0
        m = sec.get("max_score", 0) or 0
        scores.append(s)
        max_scores.append(m)
        if m > 0:
            percentages.append(min((s / m) * 100, 100))
    avg_score = _avg(scores)
    avg_max = _avg(max_scores)
    pct = round(sum(percentages) / len(percentages), 1) if percentages else 0
    return {"avg_score": avg_score, "avg_max": avg_max, "percentage": pct}


def _param_averages(audits, section):
    params_map = {}
    for a in audits:
        sec = a.get("sections", {}).get(section, {}).get("parameters", {})
        if not isinstance(sec, dict):
            continue
        for pname, pdata in sec.items():
            if pname not in params_map:
                params_map[pname] = []
            if isinstance(pdata, dict):
                params_map[pname].append(pdata.get("score", 0))
            elif isinstance(pdata, (int, float)):
                params_map[pname].append(pdata)
    return {k: _avg(v) for k, v in params_map.items()}


def _ranking_distribution(audits):
    dist = {}
    for a in audits:
        r = a.get("ranking", "Unknown")
        dist[r] = dist.get(r, 0) + 1
    return dist


def _call_category_dist(audits):
    dist = {}
    for a in audits:
        c = a.get("call_category", "unknown")
        dist[c] = dist.get(c, 0) + 1
    return dist


def _daily_trend(audits):
    day_map = {}
    for a in audits:
        day = a.get("_created_at", "")[:10]
        if day not in day_map:
            day_map[day] = {"scores": [], "count": 0}
        day_map[day]["scores"].append(a.get("total_score", 0))
        day_map[day]["count"] += 1
    result = []
    for day in sorted(day_map.keys()):
        d = day_map[day]
        result.append({
            "date": day,
            "avg_score": _avg(d["scores"]),
            "calls": d["count"],
        })
    return result


def _client_type_clause(client_type):
    """Return (sql_clause, params) to filter call_audits by client Sales/Service type.

    Sales = clients with empty ingroups, Service = clients with ingroups.
    Only applies for the 'all clients' aggregate endpoints.
    """
    if not client_type or client_type.lower() not in ("sales", "service"):
        return "", {}
    op = "=" if client_type.lower() == "sales" else "!="
    return (
        f"ca.client_id IN (SELECT id FROM clients WHERE COALESCE(ingroups, '') {op} '' COLLATE utf8mb4_general_ci) AND ",
        {},
    )


def _scope_client_id(user, requested):
    """Return the effective client id for the user's scope.

    Admins may request 'all' or a specific client. Regular (client) users are
    locked to their own client regardless of what they request.
    """
    if not user or user.get("is_admin"):
        return requested
    own = str(user.get("client_id") or "")
    return own or "all"


@router.get("/{client_id}/overview")
def client_overview(
    client_id: str,
    from_date: str = Query(default=None, description="YYYY-MM-DD"),
    to_date: str = Query(default=None, description="YYYY-MM-DD"),
    client_type: str = Query(default=None, description="Sales or Service"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not to_date:
        to_date = datetime.now().strftime("%Y-%m-%d")
    if not from_date:
        from_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    client_id = _scope_client_id(user, client_id)
    if not user.get("is_admin"):
        client_type = None

    params = {"from_date": from_date, "to_date": to_date}
    client_clause = ""
    if client_id != "all":
        client_clause = "ca.client_id = :client_id AND "
        params["client_id"] = int(client_id)
    else:
        type_clause, _ = _client_type_clause(client_type)
        client_clause = type_clause

    sql = text(f"""
        SELECT ca.*, cl.transcript
        FROM call_audits ca
        LEFT JOIN call_logs cl ON ca.call_id = cl.call_id
        WHERE {client_clause}DATE(ca.created_at) BETWEEN :from_date AND :to_date
        ORDER BY ca.created_at DESC
    """)
    rows = db.execute(sql, params).mappings().all()

    audits = [_parse_audit(dict(row)) for row in rows]

    total_calls = len(audits)
    if total_calls == 0:
        return {
            "client_id": client_id,
            "from_date": from_date,
            "to_date": to_date,
            "total_calls": 0,
            "message": "No audit data found for this period",
        }

    avg_total_score = _avg([a.get("total_score", 0) for a in audits])
    avg_percentage = _avg([a.get("percentage", 0) for a in audits])
    fatal_flag_count = sum(1 for a in audits if a.get("fatal_flag") is True)
    transcript_fatal_count = sum(1 for a in audits if a.get("_is_transcript_fatal") is True)

    sections = {}
    for sec_name in ["opening", "communication", "probing_resolution", "process_compliance", "closure"]:
        sections[sec_name] = _section_avg(audits, sec_name)

    section_params = {}
    for sec_name in ["opening", "communication", "probing_resolution", "process_compliance", "closure"]:
        section_params[sec_name] = _param_averages(audits, sec_name)

    complaint_audit_stats = {"total": 0, "request_raised": 0, "classification_map": {}}
    for a in audits:
        ca = a.get("complaint_audit", {})
        if ca:
            complaint_audit_stats["total"] += 1
            if ca.get("request_raised") == "yes":
                complaint_audit_stats["request_raised"] += 1
            cls = ca.get("request_classification", "unknown")
            complaint_audit_stats["classification_map"][cls] = (
                complaint_audit_stats["classification_map"].get(cls, 0) + 1
            )

    conversion_stats = {"total": 0, "booking_done": 0}
    for a in audits:
        cv = a.get("conversion_audit", {})
        if cv:
            conversion_stats["total"] += 1
            if cv.get("booking_done") == "yes":
                conversion_stats["booking_done"] += 1

    registration_stats = {"Full Registration": 0, "Partial": 0, "Other": 0}
    for a in audits:
        re = a.get("registration_evaluation", {})
        status = re.get("status", "Other")
        if status in registration_stats:
            registration_stats[status] += 1
        else:
            registration_stats["Other"] += 1

    sensitive_words = []
    for a in audits:
        for w in a.get("sensitive_word", []):
            if w not in sensitive_words:
                sensitive_words.append(w)

    return {
        "client_id": client_id,
        "from_date": from_date,
        "to_date": to_date,
        "total_calls": total_calls,
        "avg_total_score": avg_total_score,
        "avg_percentage": avg_percentage,
        "fatal_flag_count": fatal_flag_count,
        "transcript_fatal_count": transcript_fatal_count,
        "ranking_distribution": _ranking_distribution(audits),
        "call_category_distribution": _call_category_dist(audits),
        "sections": sections,
        "section_parameters": section_params,
        "complaint_audit": complaint_audit_stats,
        "conversion_audit": conversion_stats,
        "registration_stats": registration_stats,
        "sensitive_words": sensitive_words,
        "daily_trend": _daily_trend(audits),
    }


@router.get("/{client_id}/calls")
def client_calls(
    client_id: str,
    from_date: str = Query(default=None),
    to_date: str = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    client_type: str = Query(default=None, description="Sales or Service"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not to_date:
        to_date = datetime.now().strftime("%Y-%m-%d")
    if not from_date:
        from_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    client_id = _scope_client_id(user, client_id)
    if not user.get("is_admin"):
        client_type = None

    offset = (page - 1) * limit

    params = {"from_date": from_date, "to_date": to_date, "limit": limit, "offset": offset}
    client_clause = ""
    if client_id != "all":
        client_clause = "ca.client_id = :client_id AND "
        params["client_id"] = int(client_id)
    else:
        type_clause, _ = _client_type_clause(client_type)
        client_clause = type_clause

    count_sql = text(f"""
        SELECT COUNT(*) as total FROM call_audits ca
        WHERE {client_clause}DATE(ca.created_at) BETWEEN :from_date AND :to_date
    """)
    total = db.execute(count_sql, params).scalar()

    cl_cols = _call_log_columns(db)
    select_clauses = []
    for col in ("transcript", "duration", "recording_path", "start_time", "end_time", "agent_name"):
        if col in cl_cols:
            select_clauses.append(f"cl.{col}")
    if not select_clauses:
        select_clauses.append("NULL AS _no_call_log")

    sql = text(f"""
        SELECT ca.*, {', '.join(select_clauses)}
        FROM call_audits ca
        LEFT JOIN call_logs cl ON ca.call_id = cl.call_id
        WHERE {client_clause}DATE(ca.created_at) BETWEEN :from_date AND :to_date
        ORDER BY ca.created_at DESC
        LIMIT :limit OFFSET :offset
    """)
    rows = db.execute(sql, params).mappings().all()

    calls = [_parse_audit(dict(row)) for row in rows]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total else 0,
        "calls": calls,
    }


@router.get("/{client_id}/agents")
def client_agents(
    client_id: int,
    from_date: str = Query(default=None),
    to_date: str = Query(default=None),
    client_type: str = Query(default=None, description="Sales or Service"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not to_date:
        to_date = datetime.now().strftime("%Y-%m-%d")
    if not from_date:
        from_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    if not user.get("is_admin"):
        client_id = int(user.get("client_id") or 0)

    sql = text("""
        SELECT
            ca.agent_id,
            COUNT(*) AS total_calls,
            ROUND(AVG(ca.total_score), 1) AS avg_score,
            ROUND(AVG(JSON_EXTRACT(ca.audit_json, '$.sections.communication.score')), 1) AS conversation_score,
            ROUND(AVG(JSON_EXTRACT(ca.audit_json, '$.sections.opening.score')), 1) AS sentiment_score,
            ROUND(AVG(JSON_EXTRACT(ca.audit_json, '$.sections.process_compliance.score')), 1) AS professionalism,
            ROUND(AVG(JSON_EXTRACT(ca.audit_json, '$.sections.closure.score')), 1) AS compliance,
            SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count,
            SUM(CASE WHEN ca.percentage < 60 THEN 1 ELSE 0 END) AS low_score_count
        FROM call_audits ca
        WHERE ca.client_id = :client_id
          AND DATE(ca.created_at) BETWEEN :from_date AND :to_date
          AND ca.agent_id IS NOT NULL
          AND ca.agent_id != ''
        GROUP BY ca.agent_id
        ORDER BY avg_score DESC
    """)
    rows = db.execute(sql, {"client_id": client_id, "from_date": from_date, "to_date": to_date}).mappings().all()

    agents = []
    for row in rows:
        avg = row["avg_score"] or 0
        if avg >= 80:
            risk = "Low"
        elif avg >= 65:
            risk = "Medium"
        elif avg >= 50:
            risk = "High"
        else:
            risk = "Critical"

        agents.append({
            "id": row["agent_id"],
            "name": row["agent_id"],
            "calls": row["total_calls"],
            "avg_score": avg,
            "conversation_score": row["conversation_score"] or 0,
            "sentiment_score": row["sentiment_score"] or 0,
            "professionalism": row["professionalism"] or 0,
            "compliance": row["compliance"] or 0,
            "fatal_count": row["fatal_count"] or 0,
            "low_score_count": row["low_score_count"] or 0,
            "risk": risk,
        })

    return {"client_id": client_id, "agents": agents}


@router.get("/{client_id}/team-health")
def client_team_health(
    client_id: int,
    from_date: str = Query(default=None),
    to_date: str = Query(default=None),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not to_date:
        to_date = datetime.now().strftime("%Y-%m-%d")
    if not from_date:
        from_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    if not user.get("is_admin"):
        client_id = int(user.get("client_id") or 0)

    sql = text("""
        SELECT
            COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ca.audit_json, '$.call_category')), 'Unknown') AS team,
            COUNT(DISTINCT ca.agent_id) AS agent_count,
            COUNT(*) AS total_calls,
            ROUND(AVG(ca.total_score), 1) AS avg_score,
            SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count
        FROM call_audits ca
        WHERE ca.client_id = :client_id
          AND DATE(ca.created_at) BETWEEN :from_date AND :to_date
          AND ca.agent_id IS NOT NULL
          AND ca.agent_id != ''
        GROUP BY team
        ORDER BY avg_score DESC
    """)
    rows = db.execute(sql, {"client_id": client_id, "from_date": from_date, "to_date": to_date}).mappings().all()

    teams = []
    for row in rows:
        avg = row["avg_score"] or 0
        if avg >= 80:
            risk = "Low"
        elif avg >= 65:
            risk = "Medium"
        elif avg >= 50:
            risk = "High"
        else:
            risk = "Critical"

        teams.append({
            "team": row["team"],
            "score": avg,
            "calls": row["total_calls"],
            "agents": row["agent_count"],
            "risk": risk,
            "fatal_count": row["fatal_count"] or 0,
        })

    return {"client_id": client_id, "teams": teams}


@router.get("/call/{call_id}")
def call_detail(call_id: str, db: Session = Depends(get_db)):
    """DB-backed call detail for the Call Details page.

    Returns the real recording URL (recording_path) and the raw transcript
    parsed into speaker-separated lines with timestamps, plus score /
    timeline / behaviour data derived from call_logs + call_audits.
    """
    cl_cols = _call_log_columns(db)
    fields = ["cl.call_id", "cl.client_id", "cl.agent_id", "cl.duration", "cl.created_at"]
    for col in ("recording_path", "transcript", "start_time", "end_time", "agent_name", "voice_mail"):
        if col in cl_cols:
            fields.append(f"cl.{col}")

    sql = text(f"""
        SELECT {', '.join(fields)},
               ca.total_score, ca.percentage, ca.ranking, ca.fatal_flag, ca.audit_json
        FROM call_logs cl
        LEFT JOIN call_audits ca ON ca.call_id = cl.call_id
        WHERE cl.call_id = :call_id
        LIMIT 1
    """)
    row = db.execute(sql, {"call_id": call_id}).mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Call not found")

    data = dict(row)
    duration = max(0, int(data.get("duration") or 0))

    lines = _annotate_transcript(_split_transcript(data.get("transcript") or ""), duration)

    audit = {}
    raw_audit = data.get("audit_json")
    if isinstance(raw_audit, str):
        try:
            audit = json.loads(raw_audit)
        except Exception:
            audit = {}
    elif isinstance(raw_audit, dict):
        audit = raw_audit

    percentage = data.get("percentage")
    if percentage is not None:
        overall = round(float(percentage), 1)
    else:
        overall = round(float(data.get("total_score") or 0), 1)

    ranking = data.get("ranking") or "Unknown"
    risk = _risk_level(data.get("fatal_flag"), ranking, percentage, data.get("total_score"))
    scores = _build_scores(audit, overall)
    timeline = _derive_timeline(lines, duration)
    behaviours = _derive_behaviours(lines)

    client_name = None
    if data.get("client_id"):
        cname = db.execute(
            text("SELECT name FROM clients WHERE id = :id"),
            {"id": int(data["client_id"])},
        ).scalar()
        client_name = cname

    return {
        "id": call_id,
        "call_id": call_id,
        "client_id": data.get("client_id"),
        "agent_id": data.get("agent_id") or "",
        "agent_name": data.get("agent_name") or data.get("agent_id") or call_id,
        "customer": "Customer",
        "queue": str(audit.get("call_category") or "Inbound"),
        "team": str(audit.get("team") or ""),
        "project": client_name or "Unknown",
        "duration_sec": duration,
        "start_time": str(data.get("start_time") or ""),
        "end_time": str(data.get("end_time") or ""),
        "created_at": str(data.get("created_at") or ""),
        "recording_path": data.get("recording_path") or "",
        "audio_url": data.get("recording_path") or "",
        "voice_mail": bool(data.get("voice_mail")),
        "ranking": ranking,
        "risk": risk,
        "scores": scores,
        "timeline": timeline,
        "transcript": lines,
        "behaviours": behaviours,
        "coaching": _coaching_recommendation(risk),
    }
