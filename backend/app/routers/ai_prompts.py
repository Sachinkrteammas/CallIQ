import asyncio
import hashlib
import html
import json
import re
import threading
import time
import zipfile
import zlib
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..database import get_db, SessionLocal
from ..services.ai_audit_service import run_ai_audit, run_structured_prompt
from ..services.stt_service import transcribe_audio_bytes

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

RUN_SQL = """
CREATE TABLE IF NOT EXISTS ai_pipeline_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NULL,
    prompt_id INT NULL,
    status VARCHAR(32) DEFAULT 'running',
    stage VARCHAR(64) DEFAULT 'queued',
    fetched INT DEFAULT 0,
    transcribed INT DEFAULT 0,
    audited INT DEFAULT 0,
    error TEXT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    INDEX idx_pipeline_runs_client (client_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

_TABLE_READY = False
_RUN_TABLE_READY = False

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


def _ensure_runs_table(db: Session):
    global _RUN_TABLE_READY
    if _RUN_TABLE_READY:
        return
    try:
        db.execute(text(RUN_SQL))
        db.commit()
        _RUN_TABLE_READY = True
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to initialise pipeline runs table: {exc}") from exc


def _run_row(row) -> dict:
    return {
        "id": row["id"],
        "client_id": row["client_id"],
        "prompt_id": row["prompt_id"],
        "status": row["status"],
        "stage": row["stage"],
        "fetched": row["fetched"] or 0,
        "transcribed": row["transcribed"] or 0,
        "audited": row["audited"] or 0,
        "error": row["error"],
        "started_at": str(row["started_at"]) if row["started_at"] else "",
        "finished_at": str(row["finished_at"]) if row["finished_at"] else "",
    }


def _update_run(run_id: int, **updates):
    if not run_id or not updates:
        return
    db = None
    try:
        db = SessionLocal()
        _ensure_runs_table(db)
        columns = ", ".join(f"{key} = :{key}" for key in updates)
        db.execute(
            text(f"UPDATE ai_pipeline_runs SET {columns} WHERE id = :id"),
            {"id": run_id, **updates},
        )
        db.commit()
    except Exception as exc:
        print(f"[pipeline] failed to update run {run_id}: {exc}")
    finally:
        if db is not None:
            db.close()


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


@router.get("/{prompt_id:int}")
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


@router.patch("/{prompt_id:int}")
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


def _run_pipeline_for_client(client_id: int, max_calls: int = 10, run_id: int = None):
    """Track the fetch -> STT -> audit pipeline triggered by prompt activation."""
    errors: List[str] = []
    try:
        import fetch_worker, stt_worker, audit_worker

        _update_run(run_id, status="running", stage="fetching")
        try:
            fetched = fetch_worker.run_once(client_id=client_id, limit=max_calls) or 0
            _update_run(run_id, fetched=int(fetched))
        except Exception as exc:
            errors.append(f"fetch: {exc}")
            _update_run(run_id, fetched=0)

        _update_run(run_id, stage="transcribing")
        try:
            transcribed = stt_worker.run_once(limit=max_calls, client_id=client_id) or 0
            _update_run(run_id, transcribed=int(transcribed))
            stats = stt_worker.get_last_stats() if hasattr(stt_worker, "get_last_stats") else {}
            retryable = int(stats.get("retryable_failed") or 0)
            if retryable:
                errors.append(f"stt: {retryable} call(s) failed (last: {stats.get('last_error') or 'unknown error'})")
        except Exception as exc:
            errors.append(f"stt: {exc}")
            _update_run(run_id, transcribed=0)

        _update_run(run_id, stage="auditing")
        try:
            audited = audit_worker.run_once(limit=max_calls, client_id=client_id) or 0
            _update_run(run_id, audited=int(audited))
            stats = audit_worker.get_last_stats()
            if stats.get("errors"):
                errors.append(f"audit: {len(stats['errors'])} call(s) failed (last: {stats['errors'][-1]})")
        except Exception as exc:
            errors.append(f"audit: {exc}")
            _update_run(run_id, audited=0)

        _update_run(
            run_id,
            status="failed" if errors else "completed",
            stage="done",
            error=" | ".join(errors)[:2000] if errors else None,
            finished_at=datetime.utcnow(),
        )
        print(f"[pipeline] {'failed' if errors else 'completed'} for client {client_id} (cap={max_calls})")
    except Exception as exc:
        errors.append(f"unexpected: {exc}")
        _update_run(
            run_id,
            status="failed",
            stage="done",
            error=" | ".join(errors)[:2000],
            finished_at=datetime.utcnow(),
        )
        print(f"[pipeline] unexpected error for client {client_id}: {exc}")


@router.get("/runs/latest")
def latest_pipeline_run(client_id: int, db: Session = Depends(get_db)):
    _ensure_runs_table(db)
    row = db.execute(
        text("""
            SELECT * FROM ai_pipeline_runs
            WHERE client_id = :cid
            ORDER BY id DESC LIMIT 1
        """),
        {"cid": client_id},
    ).mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="No pipeline run found for this client")
    return _run_row(row)


@router.get("/runs/{run_id}")
def get_pipeline_run(run_id: int, db: Session = Depends(get_db)):
    _ensure_runs_table(db)
    row = db.execute(
        text("SELECT * FROM ai_pipeline_runs WHERE id = :id"), {"id": run_id}
    ).mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return _run_row(row)


@router.post("/{prompt_id}/activate")
def activate_prompt(
    prompt_id: int,
    max_calls: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    _ensure_table(db)
    _ensure_runs_table(db)
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

    run_id = None
    if client_id is not None:
        result = db.execute(
            text("""
                INSERT INTO ai_pipeline_runs (client_id, prompt_id, status, stage, started_at)
                VALUES (:cid, :pid, 'running', 'queued', NOW())
            """),
            {"cid": int(client_id), "pid": prompt_id},
        )
        db.commit()
        run_id = result.lastrowid
        threading.Thread(
            target=_run_pipeline_for_client,
            args=(int(client_id), max_calls, run_id),
            daemon=True,
        ).start()

    return {
        **get_prompt(prompt_id, db),
        "run_id": run_id,
        "pipeline": {
            "status": "running" if run_id else "skipped",
            "stage": "queued",
            "max_calls": max_calls,
        },
    }


@router.delete("/{prompt_id:int}")
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


# Keep the test contract identical for text and audio: both run the exact same
# prompt/config through the audit service; audio only adds an STT step first.
AUDIO_EXTENSIONS = {".wav", ".mp3", ".mp4", ".m4a", ".ogg", ".flac", ".webm", ".aac", ".wma", ".aiff", ".aif"}
MAX_AUDIO_BYTES = 50 * 1024 * 1024

DOC_EXTENSIONS = {".txt", ".md", ".pdf", ".docx", ".json"}
MAX_DOC_BYTES = 20 * 1024 * 1024
DOC_TYPES_TEXT = ", ".join(sorted(DOC_EXTENSIONS))


def _resolve_test_prompt(
    db: Session,
    client_id: Optional[int],
    prompt_text: Optional[str],
    config: Optional[object],
) -> Tuple[str, Optional[Dict]]:
    """Use the supplied draft prompt, else fall back to the client's active prompt."""
    text = (prompt_text or "").strip()
    cfg = _coerce_config(config) if config is not None else None

    if not text and client_id is not None:
        row = db.execute(
            text("""
                SELECT prompt_text, prompt_json FROM ai_prompts
                WHERE client_id = :client_id AND status = 'Active'
                ORDER BY updated_at DESC, id DESC LIMIT 1
            """),
            {"client_id": client_id},
        ).mappings().one_or_none()
        if row:
            text = (row["prompt_text"] or "").strip()
            if cfg is None:
                cfg = _coerce_config(row["prompt_json"])

    if not text:
        raise HTTPException(status_code=422, detail="No prompt text provided or active prompt found for the client")
    return text, cfg


def _read_doc_text(path: Path, limit: int = 20000) -> str:
    """Best-effort plain-text extraction from uploaded SOP/FAQ documents."""
    suffix = path.suffix.lower()
    try:
        if suffix == ".docx":
            with zipfile.ZipFile(path) as archive:
                xml = archive.read("word/document.xml").decode("utf-8", errors="replace")
            xml = re.sub(r"</w:p>", "\n", xml)
            parts = [html.unescape(m.group(1)) for m in re.finditer(r"<w:t[^>]*>(.*?)</w:t>", xml, re.S)]
            return "".join(parts)[:limit]

        if suffix == ".pdf":
            # Use a real PDF parser when one is installed; otherwise fall back
            # to extracting text operators from decompressed PDF streams.
            try:
                try:
                    from pypdf import PdfReader
                except ImportError:
                    from PyPDF2 import PdfReader
                reader = PdfReader(str(path))
                return "\n".join((page.extract_text() or "") for page in reader.pages)[:limit]
            except Exception:
                raw = path.read_bytes()
                chunks = []
                for match in re.finditer(rb"stream\r?\n(.*?)endstream", raw, re.S):
                    stream = match.group(1)
                    try:
                        stream = zlib.decompress(stream.strip(b"\r\n"))
                    except Exception:
                        pass
                    for text in re.findall(rb"\((?:\\.|[^()\\])*\)", stream):
                        chunks.append(text[1:-1].decode("latin-1", errors="replace"))
                return " ".join(chunks)[:limit]

        return path.read_text(encoding="utf-8", errors="replace")[:limit]
    except Exception as exc:
        print(f"[prompt-docs] read failed for {path}: {exc}")
        return ""


def _clean_filename(name: str) -> str:
    return (name or "document").replace("\\", "/").split("/")[-1]


def _validate_document(upload: UploadFile, data: bytes) -> str:
    """Return the safe filename, rejecting unsupported or oversized files."""
    name = _clean_filename(upload.filename)
    suffix = Path(name).suffix.lower()
    if suffix not in DOC_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported document '{name}'. Use one of: {DOC_TYPES_TEXT}",
        )
    if not data:
        raise HTTPException(status_code=422, detail=f"The uploaded document '{name}' is empty")
    if len(data) > MAX_DOC_BYTES:
        raise HTTPException(status_code=422, detail=f"Document '{name}' is too large (maximum 20 MB)")
    return name


def _store_document(db: Session, client_id: int, upload: UploadFile, data: bytes, doc_id: Optional[int] = None) -> dict:
    name = _validate_document(upload, data)
    client_dir = DOCS_DIR / f"client_{client_id}"
    client_dir.mkdir(parents=True, exist_ok=True)
    fpath = client_dir / f"{hashlib.md5((name + str(time.time_ns())).encode()).hexdigest()}_{name}"
    fpath.write_bytes(data)
    extracted = _read_doc_text(fpath)
    values = {
        "client_id": client_id,
        "name": name,
        "path": str(fpath),
        "hash": hashlib.sha256(data).hexdigest(),
        "mime": upload.content_type,
        "preview": extracted or None,
        "size": len(data),
    }
    if doc_id is None:
        db.execute(
            text("""
                INSERT INTO prompt_documents (client_id, file_name, file_path, file_hash, mime_type, preview, size_bytes)
                VALUES (:client_id, :name, :path, :hash, :mime, :preview, :size)
            """),
            values,
        )
    else:
        db.execute(
            text("""
                UPDATE prompt_documents
                SET client_id = :client_id, file_name = :name, file_path = :path,
                    file_hash = :hash, mime_type = :mime, preview = :preview, size_bytes = :size
                WHERE id = :doc_id AND client_id = :client_id
            """),
            {**values, "doc_id": doc_id},
        )
    return {"file_name": name, "size_bytes": len(data), "preview": extracted or ""}


def _find_document(db: Session, doc_id: int, client_id: int):
    row = db.execute(
        text("SELECT * FROM prompt_documents WHERE id = :id AND client_id = :client_id"),
        {"id": doc_id, "client_id": client_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found for this client")
    return row


@router.post("/test")
def test_prompt(payload: PromptTest, db: Session = Depends(get_db)):
    """Run the prompt against a sample transcript without activating it."""
    _ensure_table(db)
    prompt_text, prompt_json = _resolve_test_prompt(
        db, payload.client_id, payload.prompt_text, payload.config
    )
    sample = (payload.transcript or "").strip() or "[EMPTY TRANSCRIPT]"

    result = asyncio.run(
        run_ai_audit(prompt_text, sample, False, prompt_config=prompt_json)
    )
    return {
        "ok": bool(result),
        "result": result,
        "note": payload.note,
    }


@router.post("/test-audio")
async def test_prompt_audio(
    client_id: int = Form(...),
    file: UploadFile = File(...),
    prompt_text: Optional[str] = Form(None),
    config: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Upload a call recording, transcribe it, then audit it with this prompt."""
    _ensure_table(db)
    name = (file.filename or "recording.wav").replace("\\", "/").split("/")[-1]
    suffix = Path(name).suffix.lower()
    if suffix not in AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported audio file '{name}'. Use one of: {', '.join(sorted(AUDIO_EXTENSIONS))}",
        )

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=422, detail="The uploaded audio file is empty")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=422, detail="Audio file is too large (maximum 50 MB)")

    try:
        transcript = (await transcribe_audio_bytes(
            audio_bytes,
            filename=name,
            content_type=file.content_type or "audio/mpeg",
        ) or "").strip()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Audio transcription failed: {exc}")

    if not transcript:
        raise HTTPException(status_code=422, detail="No speech could be transcribed from this audio file")

    resolved_text, resolved_config = _resolve_test_prompt(db, client_id, prompt_text, config)
    try:
        result = await run_ai_audit(
            resolved_text, transcript, False, prompt_config=resolved_config
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI audit failed: {exc}")

    return {
        "ok": bool(result),
        "result": result,
        "transcript": transcript,
        "note": note,
    }


def _parameters_from_sections(sections) -> List[dict]:
    """Mirror the frontend conversion so generated drafts are audit-ready."""
    raw = sections if isinstance(sections, list) else []
    items = [s for s in raw if isinstance(s, dict)]
    weights = [max(1, int(s.get("weight") or 10)) for s in items]
    total = sum(weights) or len(items) or 1
    used = 0
    parameters = []
    for idx, section in enumerate(items):
        if not isinstance(section, dict):
            continue
        weight = 100 - used if idx == len(items) - 1 else round((weights[idx] / total) * 100)
        used += weight
        name = str(section.get("label") or section.get("key") or f"Section {idx + 1}")
        priority = "important" if str(section.get("severity") or "").lower() in ("critical", "high") else "normal"
        question = str(section.get("question") or f"Verify that the agent follows the {name.lower()} process.")
        parameters.append({
            "id": f"gen-{idx}-{hashlib.md5(name.encode()).hexdigest()[:8]}",
            "name": name,
            "description": f"Check: {question}",
            "weight": weight,
            "priority": priority,
            "evaluationType": "pass_partial_fail",
            "questions": [{
                "id": f"gen-q-{idx}",
                "name": name,
                "criteria": question,
                "weight": 100,
                "priority": priority,
                "scoringType": "pass_partial_fail",
                "required": True,
                "fatal": False,
                "hardRule": False,
                "evidenceRequired": True,
            }],
        })
    return parameters


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
            "preview": r["preview"] or "",
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
    saved: List[dict] = []
    for upload in files:
        data = await upload.read()
        saved.append(_store_document(db, client_id, upload, data))
    db.commit()
    return {"uploaded": len(saved), "files": saved}


@router.patch("/documents/{doc_id}")
async def replace_document(
    doc_id: int,
    client_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Replace an SOP/FAQ with an updated version and re-extract its text."""
    _ensure_documents_table(db)
    row = _find_document(db, doc_id, client_id)
    data = await file.read()
    updated = _store_document(db, client_id, file, data, doc_id=doc_id)
    old_path = row["file_path"]
    if old_path:
        try:
            Path(old_path).unlink(missing_ok=True)
        except Exception:
            pass
    db.commit()
    return {"id": doc_id, **updated, "replaced": True}


@router.delete("/documents/{doc_id}")
def delete_document(
    doc_id: int,
    client_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Remove an uploaded document from the client's prompt knowledge base."""
    _ensure_documents_table(db)
    row = _find_document(db, doc_id, client_id)
    db.execute(text("DELETE FROM prompt_documents WHERE id = :id"), {"id": doc_id})
    if row["file_path"]:
        try:
            Path(row["file_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    db.commit()
    return {"deleted": True, "id": doc_id}


@router.post("/generate-from-docs")
async def generate_prompt_from_docs(
    client_id: int = Form(...),
    db: Session = Depends(get_db),
):
    """Analyse uploaded process documents and generate a prompt for Prompt Builder."""
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
    used_fallback = False
    try:
        # The template contains literal JSON braces, so use replace() instead
        # of str.format() (which would treat "key" as a format field).
        result = await run_structured_prompt(
            GENERATE_FROM_DOCS_TEMPLATE.replace("{docs}", docs_text[:20000])
        )
    except Exception as exc:
        used_fallback = True
        print(f"[generate-from-docs] LLM failed: {exc}")

    sections = result.get("sections")
    if not isinstance(sections, list) or not sections:
        used_fallback = True
        result = {}
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

    # Save the generated prompt as a Draft so the user can review, test and activate.
    status = "Draft"
    generated_text = str(result.get("prompt_text") or result.get("description") or "")
    sections = sections if isinstance(sections, list) else []
    cfg = {
        "name": str(result.get("name") or "Generated From Docs"),
        "description": str(result.get("description") or ""),
        "version": "v1.0",
        "status": status,
        "sections": sections,
        "parameters": _parameters_from_sections(sections),
        "generatedPromptText": generated_text,
    }
    inserted = db.execute(
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
            "prompt_text": generated_text,
        },
    )
    db.commit()

    return {
        **result,
        "name": cfg["name"],
        "description": cfg["description"],
        "sections": sections,
        "parameters": cfg["parameters"],
        "generatedPromptText": generated_text,
        "fallback": used_fallback,
        "saved_id": inserted.lastrowid,
    }