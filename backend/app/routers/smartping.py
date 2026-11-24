"""SmartPing (Dialdesk) CDR webhook ingestion.

SmartPing/Dialdesk pushes every sales call as a CDR webhook to this endpoint.
Rows are upserted into ``cdr_webhook_logs`` on the Dialdesk database
(``SQL_DB_URL2``). The existing ``cdr_service.fetch_sales_calls`` reads that
table — so webhook ingestion is the missing link between SmartPing and the
audit pipeline.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import SessionLocal2
from app.services.recording_url import normalize_recording_url

router = APIRouter(prefix="/api/smartping", tags=["smartping"])


class SmartPingWebhook(BaseModel):
    # Accept both a single call object and a batch: {"records": [...]}
    records: List[Dict[str, Any]] = Field(default_factory=list)
    # Flexible single-object payloads
    call_uuid: Optional[str] = None
    call_id: Optional[str] = None
    queue_name: Optional[str] = None
    queue: Optional[str] = None
    campaign_name: Optional[str] = None
    agent_username: Optional[str] = None
    agent_name: Optional[str] = None
    duration: Optional[Any] = None
    total_call_duration: Optional[Any] = None
    recording: Optional[str] = None
    call_status: Optional[str] = None
    disposition: Optional[str] = None
    date_time: Optional[str] = None
    start_time: Optional[str] = None
    timestamp: Optional[str] = None
    model_config = {"extra": "allow"}

    def items(self) -> List[Dict[str, Any]]:
        if self.records:
            return self.records
        if self.call_uuid or self.queue_name:
            return [self.model_dump(exclude_unset=True)]
        return []


def _norm(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Normalize a SmartPing-ish row into cdr_webhook_logs columns."""
    get = lambda *keys: next((str(row[k]).strip() for k in keys if row.get(k) not in (None, "")), "")
    call_uuid = get("call_uuid", "call_id", "id", "cdr_id")
    queue_name = get("queue_name", "queue", "campaign_id", "campaign")
    agent = get("agent_username", "agent_name", "user", "agent")
    start_raw = get("date_time", "start_time", "timestamp", "call_time", "created_at")
    recording = get("recording", "recording_url", "recording_path", "location", "file_url")

    if not call_uuid:
        return None
    if not queue_name:
        return None

    start_time = None
    if start_raw:
        from datetime import datetime
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                start_time = datetime.strptime(start_raw[:19], fmt)
                break
            except ValueError:
                continue
        if start_time is None:
            start_time = None

    # Best-effort duration in seconds
    duration = 0
    for key in ("duration", "total_call_duration"):
        val = row.get(key)
        if val is None:
            continue
        try:
            duration = int(float(val))
            break
        except (TypeError, ValueError):
            continue
        try:
            if isinstance(val, str) and ":" in val:
                parts = [int(p) for p in val.split(":")[:3]]
                duration = parts[0] * 3600 + parts[1] * 60 + (parts[2] if len(parts) > 2 else 0)
                break
        except Exception:
            pass

    recording_norm = normalize_recording_url(recording, start_time) if recording else ""

    return {
        "call_uuid": call_uuid[:128],
        "queue_name": queue_name[:128],
        "campaign_name": get("campaign_name", "campaign_id", "queue") or None,
        "date_time": start_time,
        "agent_username": agent[:128] or None,
        "agent_name": agent[:128] or None,
        "duration": duration,
        "recording": recording_norm or None,
        "call_status": get("call_status", "status") or None,
        "disposition": get("disposition", "result", "outcome") or None,
    }


@router.get("/health")
def smartping_health():
    return {
        "status": "ok" if SessionLocal2 is not None else "db2_not_configured",
        "service": "SmartPing Webhook Endpoint",
    }


@router.post("/webhook")
def smartping_webhook(payload: SmartPingWebhook):
    """Receive SmartPing CDR records and upsert them into cdr_webhook_logs."""
    if SessionLocal2 is None:
        raise HTTPException(status_code=503, detail="SQL_DB_URL2 is not configured — SmartPing webhooks cannot be stored")

    rows = [r for r in (_norm(item) for item in payload.items()) if r]
    if not rows:
        raise HTTPException(status_code=422, detail="No recognizable CDR records in the webhook payload")

    db = SessionLocal2()
    inserted = 0
    skipped = 0
    try:
        for row in rows:
            existing = db.execute(
                text("SELECT id FROM cdr_webhook_logs WHERE call_uuid = :cid"),
                {"cid": row["call_uuid"]},
            ).scalar()
            if existing:
                skipped += 1
                continue
            db.execute(
                text("""
                    INSERT INTO cdr_webhook_logs
                        (call_uuid, queue_name, campaign_name, date_time, agent_username,
                         agent_name, duration, recording, call_status, disposition)
                    VALUES
                        (:call_uuid, :queue_name, :campaign_name, :date_time, :agent_username,
                         :agent_name, :duration, :recording, :call_status, :disposition)
                """),
                row,
            )
            inserted += 1
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to store webhook rows: {exc}")
    finally:
        db.close()

    return {"ok": True, "inserted": inserted, "skipped_duplicate": skipped}
