import json
from typing import Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from ..database import get_db

router = APIRouter(prefix="/api/settings/ai-prompts", tags=["ai-prompts"])

CREATE_SQL = """
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
        raise HTTPException(status_code=500, detail="Failed to initialise ai_prompts table")


def _coerce_config(raw):
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _extract_meta(config: Dict) -> Dict:
    return {
        "name": str(config.get("name") or "Untitled Prompt"),
        "description": str(config.get("description") or ""),
        "version": str(config.get("version") or "v1.0"),
        "status": str(config.get("status") or "Draft"),
    }


class PromptWrite(BaseModel):
    client_id: Optional[int] = None
    config: Dict
    prompt_text: Optional[str] = None
    status: Optional[str] = None


def _row_summary(r):
    return {
        "id": r["id"],
        "client_id": r["client_id"],
        "client_name": r["client_name"],
        "name": r["name"],
        "version": r["version"],
        "status": r["status"],
        "description": r["description"],
        "created_at": str(r["created_at"]) if r["created_at"] else "",
        "updated_at": str(r["updated_at"]) if r["updated_at"] else "",
    }


@router.get("")
def list_prompts(
    client_id: Optional[int] = Query(default=None),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    _ensure_table(db)
    params = {}
    where = []
    if client_id is not None:
        where.append("p.client_id = :client_id")
        params["client_id"] = client_id
    if status:
        where.append("p.status = :status")
        params["status"] = status
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    sql = text(f"""
        SELECT p.id, p.client_id, p.name, p.version, p.status, p.description,
               p.created_at, p.updated_at, c.name AS client_name
        FROM ai_prompts p
        LEFT JOIN clients c ON c.id = p.client_id
        {clause}
        ORDER BY p.updated_at DESC
    """)
    rows = db.execute(sql, params).mappings().all()
    return [_row_summary(r) for r in rows]


@router.get("/{prompt_id}")
def get_prompt(prompt_id: int, db: Session = Depends(get_db)):
    _ensure_table(db)
    row = db.execute(
        text("""
            SELECT p.*, c.name AS client_name
            FROM ai_prompts p
            LEFT JOIN clients c ON c.id = p.client_id
            WHERE p.id = :id
        """),
        {"id": prompt_id},
    ).mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {
        **_row_summary(row),
        "prompt_text": row["prompt_text"],
        "prompt_json": _coerce_config(row["prompt_json"]),
    }


@router.post("")
def create_prompt(payload: PromptWrite, db: Session = Depends(get_db)):
    _ensure_table(db)
    if payload.client_id is None:
        raise HTTPException(status_code=422, detail="client_id is required")

    cfg = payload.config or {}
    meta = _extract_meta(cfg)
    status = payload.status or meta["status"]

    db.execute(
        text("""
            INSERT INTO ai_prompts (client_id, name, description, version, status, prompt_json, prompt_text)
            VALUES (:client_id, :name, :description, :version, :status, :prompt_json, :prompt_text)
        """),
        {
            "client_id": payload.client_id,
            "name": meta["name"],
            "description": meta["description"],
            "version": meta["version"],
            "status": status,
            "prompt_json": json.dumps(cfg, ensure_ascii=False),
            "prompt_text": payload.prompt_text,
        },
    )
    db.commit()
    new_id = db.execute(text("SELECT LAST_INSERT_ID() AS id")).scalar()
    return get_prompt(new_id, db)


@router.patch("/{prompt_id}")
def update_prompt(prompt_id: int, payload: PromptWrite, db: Session = Depends(get_db)):
    _ensure_table(db)
    existing = db.execute(
        text("SELECT id FROM ai_prompts WHERE id = :id"), {"id": prompt_id}
    ).mappings().one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Prompt not found")

    cfg = payload.config or {}
    meta = _extract_meta(cfg)
    fields = []
    params = {"id": prompt_id}

    if payload.client_id is not None:
        fields.append("client_id = :client_id")
        params["client_id"] = payload.client_id
    if cfg:
        fields += [
            "prompt_json = :prompt_json",
            "name = :name",
            "description = :description",
            "version = :version",
        ]
        params.update({
            "prompt_json": json.dumps(cfg, ensure_ascii=False),
            "name": meta["name"],
            "description": meta["description"],
            "version": meta["version"],
        })
    if payload.status:
        fields.append("status = :status")
        params["status"] = payload.status
    if payload.prompt_text is not None:
        fields.append("prompt_text = :prompt_text")
        params["prompt_text"] = payload.prompt_text

    if fields:
        db.execute(
            text(f"UPDATE ai_prompts SET {', '.join(fields)} WHERE id = :id"),
            params,
        )
        db.commit()
    return get_prompt(prompt_id, db)


@router.post("/{prompt_id}/activate")
def activate_prompt(prompt_id: int, db: Session = Depends(get_db)):
    _ensure_table(db)
    existing = db.execute(
        text("SELECT client_id FROM ai_prompts WHERE id = :id"), {"id": prompt_id}
    ).mappings().one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Prompt not found")

    db.execute(
        text("""
            UPDATE ai_prompts
            SET status = 'Archived', updated_at = CURRENT_TIMESTAMP
            WHERE client_id = :client_id AND status = 'Active'
        """),
        {"client_id": existing["client_id"]},
    )
    db.execute(
        text("""
            UPDATE ai_prompts
            SET status = 'Active', updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        """),
        {"id": prompt_id},
    )
    db.commit()
    return get_prompt(prompt_id, db)


@router.delete("/{prompt_id}")
def delete_prompt(prompt_id: int, db: Session = Depends(get_db)):
    _ensure_table(db)
    res = db.execute(text("DELETE FROM ai_prompts WHERE id = :id"), {"id": prompt_id})
    db.commit()
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {"ok": True}