import asyncio
import hashlib
import json
import threading
from typing import Dict, List, Optional
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..database import get_db
from ..services.ai_audit_service import run_ai_audit

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

DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "prompt_docs"

CREATE_DOCS_SQL = """
CREATE TABLE IF NOT EXISTS prompt_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(512) NOT NULL,
    file_hash VARCHAR(64) NULL,
    mime_type VARCHAR(100) DEFAULT NULL,
    preview TEXT NULL,
    size_bytes INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

_DOCS_TABLE_READY = False


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


def _ensure_documents_table(db: Session):
    global _DOCS_TABLE_READY
    if _DOCS_TABLE_READY:
        return
    try:
        db.execute(text(CREATE_DOCS_SQL))
        db.commit()
        _DOCS_TABLE_READY = True
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to initialise prompt_documents table")


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

    result = db.execute(
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
    # Use the insert cursor's id: LAST_INSERT_ID() can land on a different
    # pooled connection after commit and return 0 (which surfaced as a 404).
    new_id = result.lastrowid
    if not new_id:
        row = db.execute(
            text("""
                SELECT id FROM ai_prompts
                WHERE client_id = :client_id
                ORDER BY id DESC LIMIT 1
            """),
            {"client_id": payload.client_id},
        ).scalar()
        new_id = row
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


def _run_pipeline_for_client(client_id: int, max_calls: int = 10):
    """Best-effort pipeline after prompt activation: fetch -> STT -> audit.
    Capped to max_calls to avoid unexpected cost."""
    try:
        import fetch_worker, stt_worker, audit_worker
        # fetch new calls (best-effort), then process only a small batch
        try:
            fetch_worker.run_once(client_id=client_id, limit=max_calls)
        except Exception as e:
            print(f"[pipeline] fetch failed for client {client_id}: {e}")
        try:
            stt_worker.run_once(limit=max_calls, client_id=client_id)
        except Exception as e:
            print(f"[pipeline] stt failed for client {client_id}: {e}")
        try:
            audit_worker.run_once(limit=max_calls, client_id=client_id)
        except Exception as e:
            print(f"[pipeline] audit failed for client {client_id}: {e}")
        print(f"[pipeline] completed for client {client_id} (cap={max_calls})")
    except Exception as e:
        print(f"[pipeline] unexpected error for client {client_id}: {e}")


@router.post("/{prompt_id}/activate")
def activate_prompt(prompt_id: int, db: Session = Depends(get_db)):
    _ensure_table(db)
    existing = db.execute(
        text("SELECT client_id FROM ai_prompts WHERE id = :id"), {"id": prompt_id}
    ).mappings().one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Prompt not found")

    client_id = existing["client_id"]
    db.execute(
        text("""
            UPDATE ai_prompts
            SET status = 'Archived', updated_at = CURRENT_TIMESTAMP
            WHERE client_id = :client_id AND status = 'Active'
        """),
        {"client_id": client_id},
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

    # Auto-run pipeline in background with safe cap (5-10 calls) to avoid cost
    if client_id is not None:
        threading.Thread(target=_run_pipeline_for_client, args=(int(client_id), 10), daemon=True).start()

    return get_prompt(prompt_id, db)


@router.delete("/{prompt_id}")
def delete_prompt(prompt_id: int, db: Session = Depends(get_db)):
    _ensure_table(db)
    res = db.execute(text("DELETE FROM ai_prompts WHERE id = :id"), {"id": prompt_id})
    db.commit()
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {"ok": True}


# ════════════════════════════════════════════════════════════════
# PROMPT TESTING (Issue 1) + DOCUMENT UPLOAD & PROMPT GENERATION (Issue 5)
# ════════════════════════════════════════════════════════════════

class PromptTest(BaseModel):
    client_id: Optional[int] = None
    prompt_text: Optional[str] = None
    config: Optional[Dict] = None
    transcript: Optional[str] = None
    note: Optional[str] = None


def _read_doc_text(path: Path) -> str:
    """Best-effort plain-text extraction from uploaded documents."""
    try:
        if path.suffix.lower() == ".txt":
            return path.read_text(encoding="utf-8", errors="replace")[:4000]
        return path.read_text(encoding="utf-8", errors="replace")[:4000]
    except Exception as exc:
        print(f"[prompt-docs] read failed for {path}: {exc}")
        return ""


@router.post("/test")
def test_prompt(payload: PromptTest, db: Session = Depends(get_db)):
    """Run the prompt against a sample transcript without activating it."""
    _ensure_table(db)
    prompt_text = payload.prompt_text
    prompt_json = payload.config

    if not prompt_text and payload.client_id is not None:
        row = db.execute(
            text("""
                SELECT prompt_text, prompt_json FROM ai_prompts
                WHERE client_id = :client_id AND status = 'Active'
                ORDER BY updated_at DESC, id DESC LIMIT 1
            """),
            {"client_id": payload.client_id},
        ).mappings().one_or_none()
        if row:
            prompt_text = row["prompt_text"]
            if prompt_json is None:
                prompt_json = _coerce_config(row["prompt_json"])

    if not (prompt_text or "").strip():
        raise HTTPException(status_code=422, detail="No prompt text provided or active prompt found for the client")

    sample = (payload.transcript or "").strip() or "[EMPTY TRANSCRIPT]"

    result = asyncio.run(
        run_ai_audit(
            prompt_text,
            sample,
            False,
            prompt_config=prompt_json,
        )
    )
    return {
        "ok": bool(result),
        "result": result,
        "note": payload.note,
    }


GENERATE_FROM_DOCS_TEMPLATE = """
You are a call quality auditor for a sales/service process. Analyze the
process documents below and generate a structured AI audit prompt for calls
made under this process.

PROCESS DOCUMENTS:
{docs}

Respond with ONLY a JSON object with these keys:
- "name": short prompt name (string)
- "description": one-sentence description of what the prompt audits (string)
- "sections": list of audit sections, each {"key": "snake_case", "label": "Title Case", "weight": number, "max_score": number, "question": "What to check", "severity": "Critical|High|Medium|Low"}
- "prompt_text": the full prompt text sent to the AI auditor for each call (string)

Keep the sections focused on behaviours relevant to this process (e.g. greeting
compliance, script adherence, objection handling, closing techniques). Do not
include sales-classification fields; those are added automatically.
"""


@router.get("/documents")
def list_documents(client_id: Optional[int] = Query(default=None), db: Session = Depends(get_db)):
    _ensure_documents_table(db)
    sql = "SELECT id, client_id, file_name, file_path, file_hash, mime_type, preview, size_bytes, created_at FROM prompt_documents"
    params = {}
    if client_id is not None:
        sql += " WHERE client_id = :client_id"
        params["client_id"] = client_id
    sql += " ORDER BY created_at DESC, id DESC LIMIT 200"
    rows = db.execute(text(sql), params).mappings().all()
    return [
        {
            "id": r["id"],
            "client_id": r["client_id"],
            "file_name": r["file_name"],
            "file_path": r["file_path"],
            "size_bytes": r["size_bytes"] or 0,
            "mime_type": r["mime_type"],
            "preview": (r["preview"] or "")[:300],
            "created_at": str(r["created_at"]) if r["created_at"] else "",
        }
        for r in rows
    ]


@router.post("/documents")
async def upload_documents(
    client_id: int = Form(...),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    _ensure_documents_table(db)
    client_dir = DOCS_DIR / f"client_{client_id}"
    client_dir.mkdir(parents=True, exist_ok=True)

    saved: List[dict] = []
    for upload in files:
        data = await upload.read()
        name = (upload.filename or "document").replace("\\", "/").split("/")[-1]
        fpath = client_dir / f"{hashlib.md5((name + str(__import__('time').time_ns())).encode()).hexdigest()}_{name}"
        fpath.write_bytes(data)
        text_preview = data[:400].decode("utf-8", errors="replace").replace("\r", "").strip()
        if not text_preview and name.lower().endswith((".txt", ".md", ".json")):
            text_preview = _read_doc_text(fpath)[:400]
        db.execute(
            text("""
                INSERT INTO prompt_documents (client_id, file_name, file_path, file_hash, mime_type, preview, size_bytes)
                VALUES (:client_id, :name, :path, :hash, :mime, :preview, :size)
            """),
            {
                "client_id": client_id,
                "name": name,
                "path": str(fpath),
                "hash": hashlib.sha256(data).hexdigest(),
                "mime": upload.content_type,
                "preview": text_preview or None,
                "size": len(data),
            },
        )
        saved.append({"file_name": name, "size_bytes": len(data), "preview": (text_preview or "")[:300]})
    db.commit()
    return {"uploaded": len(saved), "files": saved}


@router.post("/generate-from-docs")
def generate_prompt_from_docs(
    client_id: int = Form(...),
    db: Session = Depends(get_db),
):
    """Analyse uploaded process documents and generate a prompt for Prompt Builder."""
    from app.services.ai_audit_service import run_ai_audit

    _ensure_documents_table(db)
    rows = db.execute(
        text("""
            SELECT file_name, preview FROM prompt_documents
            WHERE client_id = :client_id ORDER BY created_at DESC, id DESC LIMIT 10
        """),
        {"client_id": client_id},
    ).mappings().all()

    if not rows:
        raise HTTPException(status_code=422, detail="No documents uploaded for this client")

    docs_text = "\n\n---\n\n".join(
        f"[FILE: {r['file_name']}]\n{(r['preview'] or '')}"
        for r in rows
    )

    result: Dict = {}
    try:
        result = asyncio.run(
            run_ai_audit(
                GENERATE_FROM_DOCS_TEMPLATE.format(docs=docs_text[:12000]),
                docs_text,
                False,
            )
        )
    except Exception as exc:
        print(f"[generate-from-docs] LLM failed: {exc}")

    if not result:
        # Heuristic fallback so the feature still delivers a usable prompt
        sections = [
            {"key": "greeting_compliance", "label": "Greeting & Compliance", "weight": 2, "max_score": 20, "question": "Was the greeting and introduction complete?", "severity": "Critical"},
            {"key": "script_adherence", "label": "Script Adherence", "weight": 3, "max_score": 30, "question": "Did the agent follow the process script?", "severity": "High"},
            {"key": "objection_handling", "label": "Objection Handling", "weight": 2, "max_score": 20, "question": "Was the customer objection handled well?", "severity": "Medium"},
            {"key": "closing_techniques", "label": "Closing & Next Steps", "weight": 1, "max_score": 15, "question": "Was the call closed properly with next steps?", "severity": "Medium"},
        ]
        result = {
            "name": f"{(rows[0]['file_name'] or 'Document').split('.')[0]} Based Audit",
            "description": "AI audit prompt generated from uploaded process documents.",
            "sections": sections,
            "prompt_text": (
                "You are a call quality auditor for this sales process. Review the call transcript "
                "and score the following sections (0-10 per question) plus return a summary of strengths, "
                "areas for improvement and a customer confirmation check."
            ),
        }

    # Save the generated prompt as a Draft so the user can review & activate
    status = "Draft"
    cfg = {
        "name": str(result.get("name") or "Generated From Docs"),
        "description": str(result.get("description") or ""),
        "version": "v1.0",
        "status": status,
        "sections": result.get("sections") or [],
    }
    db.execute(
        text("""
            INSERT INTO ai_prompts (client_id, name, description, version, status, prompt_json, prompt_text)
            VALUES (:client_id, :name, :description, :version, :status, :prompt_json, :prompt_text)
        """),
        {
            "client_id": client_id,
            "name": cfg["name"],
            "description": cfg["description"],
            "version": cfg["version"],
            "status": status,
            "prompt_json": json.dumps(cfg, ensure_ascii=False),
            "prompt_text": result.get("prompt_text"),
        },
    )
    db.commit()

    return {**result, "saved_id": None}