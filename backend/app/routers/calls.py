import random
import json
from typing import Optional
from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal2
from app.services.audit_diagnostics import (
    audit_diagnostics, call_status, coerce_audit_json, has_audit_data,
)
from app.services.recording_url import normalize_recording_url
from .. import data

router = APIRouter(prefix="/api/calls", tags=["calls"])

# Behaviour drill-down from the Conversation Intelligence heatmap.
_BEHAVIOUR_FILTERS = {
    "Dead Air": "dead_air_pct > 10",
    "Long Hold": "long_hold_sec > 30",
    "Interruptions": "interruptions > 2",
    "Talk Ratio": "talk_ratio_pct < 35",
    "Silence": "silence_pct > 10",
    "Cross Talk": "cross_talk_pct > 5",
    "Escalation": "escalation_pct > 5",
    "Script Dev": "script_deviation_pct > 15",
}


def _db_row_to_call(row, agent_info=None) -> dict:
    audit_json = coerce_audit_json(row.get("audit_json"))

    recording = normalize_recording_url(row.get("recording_path") or "")
    if recording and not recording.startswith("http"):
        recording = f"http://{recording}"

    has_audit = has_audit_data(dict(row))
    status, processing_error = call_status(has_audit, row.get("transcript"))
    fatal_errors, critical_failures = audit_diagnostics(audit_json)

    return {
        "_call_id": row.get("call_id"),
        "_id": row.get("call_id"),
        "_agent_id": row.get("agent_id"),
        "_agent_name": (agent_info or {}).get("displayname") or row.get("agent_id"),
        "_duration": row.get("duration") or 0,
        "_created_at": str(row.get("start_time") or row.get("created_at") or ""),
        "_recording_path": recording,
        "has_audit": has_audit,
        "status": status,
        "processing_error": processing_error,
        "total_score": row.get("total_score") if has_audit else None,
        "percentage": row.get("percentage") if has_audit else None,
        "ranking": row.get("ranking") if has_audit else "Pending",
        "fatal_flag": bool(row.get("fatal_flag")) if has_audit else False,
        "fatal_errors": fatal_errors,
        "critical_failures": critical_failures,
        "call_category": audit_json.get("call_category") or "—",
        "sections": audit_json.get("sections") or {},
        "audit_json": audit_json,
        "evaluation": audit_json,
        "sale_category": row.get("sale_category") if has_audit else "Pending",
        "invalid_reason": row.get("invalid_reason") if has_audit else None,
        "crm_sale_done": bool(row.get("crm_sale_done")) if has_audit and row.get("crm_sale_done") is not None else False,
        "customer_confirmation": row.get("customer_confirmation") if has_audit else "Pending",
        "order_information": row.get("order_information") if has_audit else "Pending",
        "agent_total_audits": (agent_info or {}).get("total_audits", 0),
        "agent_avg_score": (agent_info or {}).get("avg_score", 0),
        "agent_fatal_count": (agent_info or {}).get("fatal_count", 0),
    }


def _get_agent_info(db: Session, agent_id: str):
    if not agent_id:
        return None

    displayname = None
    try:
        if SessionLocal2:
            db2 = SessionLocal2()
            try:
                row = db2.execute(
                    text("SELECT displayname FROM agent_master WHERE username = :u"),
                    {"u": agent_id},
                ).mappings().one_or_none()
                if row:
                    displayname = row["displayname"]
            finally:
                db2.close()
    except Exception:
        pass

    stats = None
    try:
        stats = db.execute(text("""
            SELECT COUNT(*) AS total_audits,
                   AVG(total_score) AS avg_score,
                   SUM(CASE WHEN fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count
            FROM call_audits WHERE agent_id = :a
        """), {"a": agent_id}).mappings().one_or_none()
    except Exception:
        pass

    return {
        "displayname": displayname or agent_id,
        "total_audits": int(stats["total_audits"] or 0) if stats else 0,
        "avg_score": round(float(stats["avg_score"] or 0), 1) if stats else 0,
        "fatal_count": int(stats["fatal_count"] or 0) if stats else 0,
    }


@router.get("")
def list_calls(
    q: Optional[str] = None,
    client_id: Optional[int] = None,       # NEW
    client_type: Optional[str] = None,     # NEW
    agent_id: Optional[str] = None,
    sale_category: Optional[str] = None,
    invalid_reason: Optional[str] = None,
    crm_sale_done: Optional[bool] = None,
    customer_confirmation: Optional[str] = None,
    order_information: Optional[str] = None,
    process: Optional[str] = None,              # configured process / campaign / ingroup
    behaviour: Optional[str] = None,            # heatmap behaviour drill-down
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    band: Optional[str] = None,            # BQ / MQ / TQ
    status: Optional[str] = None,          # Completed / Awaiting Audit / Pending / failed transcript
    page: int = 1,
    page_size: int = 15,
    db: Session = Depends(get_db),
):
    where = ["1=1"]
    params = {}

    if q:
        where.append("(cl.call_id LIKE :q OR cl.agent_id LIKE :q)")
        params["q"] = f"%{q}%"
    if client_id:
        where.append("cl.client_id = :client_id")
        params["client_id"] = client_id
    elif client_type and client_type.lower() in ("sales", "service"):
        op = "=" if client_type.lower() == "sales" else "!="
        where.append(f"cl.client_id IN (SELECT id FROM clients WHERE COALESCE(ingroups, '') {op} '' COLLATE utf8mb4_general_ci)")
    if process:
        # Exact token match against the configured process names of a client.
        where.append(
            "cl.client_id IN ("
            "SELECT id FROM clients WHERE CONCAT(',', COALESCE(name, ''), ',', "
            "COALESCE(campaigns, ''), ',', COALESCE(ingroups, ''), ',') "
            "LIKE :process_pattern)"
        )
        params["process_pattern"] = f"%,{process},%"
    if behaviour:
        vad_condition = _BEHAVIOUR_FILTERS.get(behaviour)
        if vad_condition:
            where.append(
                f"cl.call_id IN (SELECT call_id FROM call_vad_metrics WHERE {vad_condition})"
            )
        elif behaviour == "Sentiment":
            where.append("ca.percentage < 80")
    if agent_id:
        where.append("cl.agent_id = :agent_id")
        params["agent_id"] = agent_id
    if from_date:
        where.append("cl.start_time >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append("cl.start_time <= :to_date")
        params["to_date"] = to_date + " 23:59:59"
    if sale_category:
        where.append("ca.sale_category = :sale_category")
        params["sale_category"] = sale_category
    if invalid_reason:
        where.append("ca.invalid_reason = :invalid_reason")
        params["invalid_reason"] = invalid_reason
    if crm_sale_done is not None:
        where.append("ca.crm_sale_done = :crm_sale_done")
        params["crm_sale_done"] = crm_sale_done
    if customer_confirmation:
        where.append("ca.customer_confirmation = :customer_confirmation")
        params["customer_confirmation"] = customer_confirmation
    if order_information:
        where.append("ca.order_information = :order_information")
        params["order_information"] = order_information

    # â•â•â• BAND FILTER â•â•â•
    if band:
        if band == "BQ":
            where.append("ca.percentage < 89")
        elif band == "MQ":
            where.append("ca.percentage >= 89 AND ca.percentage < 94")
        elif band == "TQ":
            where.append("ca.percentage >= 94")

    # ═══ AUDIT STATUS FILTER ═══
    if status:
        wanted = status.strip()
        if wanted.lower() == "completed":
            where.append("ca.id IS NOT NULL")
        elif wanted.lower() in ("pending", "awaiting audit"):
            where.append("ca.id IS NULL")
        elif wanted == "Recording Missing":
            where.append("cl.transcript = '[RECORDING_MISSING]' AND ca.id IS NULL")
        elif wanted == "No Speech":
            where.append("cl.transcript = '[NO_SPEECH]' AND ca.id IS NULL")
        elif wanted == "Transcript Failed":
            where.append("cl.transcript = '[TRANSCRIPT_FAILED]' AND ca.id IS NULL")

    wc = " AND ".join(where)

    count_sql = text(f"""
        SELECT COUNT(*) FROM call_logs cl
        LEFT JOIN call_audits ca ON ca.call_id = cl.call_id
        WHERE {wc}
    """)
    total = db.execute(count_sql, params).scalar() or 0

    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    data_sql = text(f"""
        SELECT cl.call_id, cl.agent_id, cl.duration, cl.start_time,
               cl.recording_path, cl.created_at, cl.transcript,
               ca.total_score, ca.percentage, ca.ranking, ca.fatal_flag, ca.audit_json,
               ca.sale_category, ca.invalid_reason, ca.crm_sale_done,
               ca.customer_confirmation, ca.order_information
        FROM call_logs cl
        LEFT JOIN call_audits ca ON ca.call_id = cl.call_id
        WHERE {wc}
        ORDER BY cl.start_time DESC
        LIMIT :limit OFFSET :offset
    """)
    rows = db.execute(data_sql, params).mappings().all()

    agent_ids = set(r["agent_id"] for r in rows if r["agent_id"])
    agent_stats = {}
    if agent_ids:
        placeholders = ",".join([f":a{i}" for i in range(len(agent_ids))])
        try:
            stat_rows = db.execute(text(f"""
                SELECT agent_id,
                       COUNT(*) AS total_audits,
                       AVG(total_score) AS avg_score,
                       SUM(CASE WHEN fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count
                FROM call_audits
                WHERE agent_id IN ({placeholders})
                GROUP BY agent_id
            """), {f"a{i}": a for i, a in enumerate(agent_ids)}).mappings().all()
            for sr in stat_rows:
                agent_stats[sr["agent_id"]] = {
                    "total_audits": int(sr["total_audits"] or 0),
                    "avg_score": round(float(sr["avg_score"] or 0), 1),
                    "fatal_count": int(sr["fatal_count"] or 0),
                }
        except Exception:
            pass

    items = []
    for r in rows:
        info = agent_stats.get(r["agent_id"], {"total_audits": 0, "avg_score": 0, "fatal_count": 0})
        items.append(_db_row_to_call(dict(r), info))

    return {
        "items": items,
        "calls": items,  # backward compat
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size else 0,
    }


@router.get("/{call_id}/recording")
async def stream_recording(call_id: str, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT recording_path FROM call_logs WHERE call_id = :cid"),
        {"cid": call_id},
    ).mappings().one_or_none()

    if not row or not row["recording_path"]:
        raise HTTPException(status_code=404, detail="Recording not found")

    url = normalize_recording_url(row["recording_path"])
    if not url.startswith("http"):
        url = f"http://{url}"

    import httpx
    from fastapi.responses import StreamingResponse

    async def _stream():
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("GET", url) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        yield chunk
        except httpx.HTTPError as e:
            print(f"[recording-proxy] failed: {e}")
            return

    return StreamingResponse(_stream(), media_type="audio/mpeg",
        headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600"})


@router.get("/{call_id}")
def get_call(call_id: str, db: Session = Depends(get_db)):
    row = db.execute(
        text("""
            SELECT cl.call_id, cl.agent_id, cl.duration, cl.start_time,
                   cl.transcript, cl.recording_path, cl.created_at,
                   ca.total_score, ca.percentage, ca.ranking, ca.fatal_flag, ca.audit_json,
                   ca.sale_category, ca.invalid_reason, ca.crm_sale_done,
                   ca.customer_confirmation, ca.order_information
            FROM call_logs cl
            LEFT JOIN call_audits ca ON ca.call_id = cl.call_id
            WHERE cl.call_id = :cid
        """),
        {"cid": call_id},
    ).mappings().one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Call not found")

    audit_json = row.get("audit_json") or {}
    if isinstance(audit_json, str):
        try:
            audit_json = json.loads(audit_json)
        except Exception:
            audit_json = {}

    agent_info = _get_agent_info(db, row["agent_id"])

    raw_transcript = row.get("transcript") or ""
    transcript = []
    if raw_transcript:
        import re
        parts = re.split(r'(?i)(?=(?:agent|customer)[:\s])', raw_transcript)
        if len(parts) > 1:
            for p in parts:
                p = p.strip()
                if not p:
                    continue
                speaker = "agent" if p.lower().startswith("agent") else "customer"
                text_val = re.sub(r'^(?:agent|customer)[:\s]*', '', p, flags=re.I).strip()
                if text_val:
                    transcript.append({
                        "speaker": speaker,
                        "time": "0:00",
                        "text": text_val,
                    })
        else:
            transcript = [{"speaker": "agent", "time": "0:00", "text": raw_transcript}]

    return {
        **_db_row_to_call(dict(row), agent_info),
        "transcript": transcript,
        "transcript_raw": raw_transcript,
        "timeline": audit_json.get("timeline", []),
        "scores": audit_json.get("scores", {}),
        "behaviours": audit_json.get("behaviours_detected", []),
        "emotion_journey": audit_json.get("emotion_journey", []),
        "summary": audit_json.get("summary", ""),
        "recommendations": audit_json.get("recommendations", []),
        "areas_for_improvement": audit_json.get("areas_for_improvement", []),
    }
