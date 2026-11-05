"""Sales call ingestion from the Dialdesk CDR webhook log.

The Dialdesk CRM stores every call pushed by the VICIdial CDR webhook in
``db_dialdesk.cdr_webhook_logs`` (host configured through ``SQL_DB_URL2``).
Older sales clients were only synced from the dialer ``vicidial_log`` table,
so clients whose calls live in the webhook log never produced any audits.

This module is read-only against ``cdr_webhook_logs``. It only selects rows;
writing happens through the existing ``fetch_calls_for_client`` path.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from app.database import SessionLocal2
from app.models.client import Client
from app.services.recording_url import normalize_recording_url

# Queue names inside ``cdr_webhook_logs`` for the sales clients that already
# exist in CallIQ. These differ from the legacy VICIdial campaign ids stored in
# ``clients.campaigns`` (e.g. Sotrue_ob vs SOTRUECART), so an explicit alias is
# needed. Clients added from the CDR import UI store the exact queue name in
# ``clients.campaigns`` and therefore need no alias.
CDR_QUEUE_ALIASES: Dict[str, tuple[str, ...]] = {
    "sotruec2p": (
        "SOTRUECART",
        "Sotrue OB",
        "Sotrurepeat",
        "Soture_South",
    ),
    "soulflowerc2p": (
        "SOULFLOWER -PT INVENT - CART CALLING",
        "Soulflowerc2p",
        "soulflower repeat calling",
    ),
    "hatke": (
        "THE HATKE CART CALLING",
        "TheHatke",
    ),
    "winston": (
        "Winston OB",
        "WinstonOB",
    ),
    "digicoffer": (
        "DIGICOFFER north ",
        "Digicoffer South calling",
        "DIGIC000",
        "DIGIC001",
    ),
    "f1 pixel": (
        "PixelInbound",
        "F1OB0000",
    ),
    "dialdesksales": ("Dialdessales",),
    "betterhood": (
        "Betterhood C2P",
        "incoming betterhood ",
        "BETTE001",
    ),
    "roamprime": (
        "Roamprime",
        "ROAMP000",
        "ROAMP002",
    ),
    "burger singh feedback": ("BURGE000",),
}

# Queues that are not real clients / should never be imported.
_IGNORED_QUEUES = {"", "null", "none", "string", "testing"}

_SOURCES_CACHE: Dict[str, Any] = {"at": 0.0, "data": []}
_SOURCES_TTL_SECONDS = 300


def _discard_ignored(name: Optional[str]) -> str:
    return (name or "").strip()


def queue_key(name: str) -> str:
    """Normalize a CDR queue name for case/whitespace-insensitive matching."""
    return " ".join((name or "").strip().lower().split())


def known_queue_keys() -> set[str]:
    """Queue keys already represented by an existing CallIQ sales client."""
    return {queue_key(q) for queues in CDR_QUEUE_ALIASES.values() for q in queues}


def get_client_queues(client: Client) -> List[str]:
    """Return the CDR webhook queues that belong to *client*.

    Alias queues are used for the known sales clients; any exact queue name in
    ``clients.campaigns`` is also accepted so clients created from the CDR
    import work without a code change.
    """
    normalized = queue_key(client.name or "")
    candidates: List[str] = list(CDR_QUEUE_ALIASES.get(normalized, ()))

    for token in (client.campaigns or "").split(","):
        queue = token.strip()
        if queue and queue_key(queue) not in _IGNORED_QUEUES:
            candidates.append(queue)

    seen = set()
    queues: List[str] = []
    for queue in candidates:
        key = queue_key(queue)
        if not key or key in _IGNORED_QUEUES or key in seen:
            continue
        seen.add(key)
        queues.append(queue)
    return queues


def _time_to_seconds(value: Any) -> int:
    """Convert a MySQL TIME / timedelta / string value to whole seconds."""
    if value is None or value == "":
        return 0
    if isinstance(value, timedelta):
        return max(0, int(value.total_seconds()))
    if isinstance(value, time):
        return max(0, value.hour * 3600 + value.minute * 60 + value.second)
    if isinstance(value, (int, float)):
        return max(0, int(value))
    text_value = str(value).strip()
    if not text_value:
        return 0
    parts = text_value.split(":")
    try:
        if len(parts) == 3:
            return max(0, int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2]))
        if len(parts) == 2:
            return max(0, int(parts[0]) * 60 + int(parts[1]))
        return max(0, int(float(text_value)))
    except (TypeError, ValueError):
        return 0


def _agent_for_row(row: Dict[str, Any]) -> str:
    for key in ("agent_username", "agent_name"):
        value = (row.get(key) or "").strip()
        if value:
            return value
    return ""


def fetch_sales_calls(
    client: Client,
    *,
    lookback_hours: int = 48,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch recent auditable sales calls for *client* from the webhook log.

    Only rows with a recording and an agent are returned; abandoned / not
    patched calls cannot be transcribed or attributed to an agent.
    """
    queues = get_client_queues(client)
    if not queues or SessionLocal2 is None:
        return []

    limit = max(1, min(int(limit or 200), 500))
    lookback_hours = max(1, int(lookback_hours or 48))

    placeholders = ", ".join(f":q{i}" for i in range(len(queues)))
    params: Dict[str, Any] = {f"q{i}": q for i, q in enumerate(queues)}
    params["lookback_hours"] = lookback_hours
    params["limit"] = limit

    sql = text(
        f"""
        SELECT
            id,
            call_uuid,
            date_time,
            queue_name,
            campaign_name,
            agent_username,
            agent_name,
            duration,
            total_call_duration,
            recording,
            call_status,
            disposition
        FROM cdr_webhook_logs
        WHERE queue_name IN ({placeholders})
          AND date_time IS NOT NULL
          AND date_time >= DATE_SUB(NOW(), INTERVAL :lookback_hours HOUR)
          AND date_time <= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
          AND COALESCE(recording, '') <> ''
          AND (
                COALESCE(TRIM(agent_username), '') <> ''
             OR COALESCE(TRIM(agent_name), '') <> ''
          )
        ORDER BY date_time DESC
        LIMIT :limit
        """
    )

    db = SessionLocal2()
    try:
        rows = db.execute(sql, params).mappings().all()
    except Exception as exc:
        print(f"[cdr] fetch failed for {client.name}: {exc}")
        return []
    finally:
        db.close()

    payload: List[Dict[str, Any]] = []
    for row in rows:
        row = dict(row)
        agent = _agent_for_row(row)
        recording = (row.get("recording") or "").strip()
        start_time = row.get("date_time")
        if (
            not agent
            or agent.lower() in {"null", "none", "string"}
            or not recording
            or recording.lower() in {"null", "none", "string"}
            or not start_time
        ):
            continue

        duration = _time_to_seconds(row.get("duration"))
        if not duration:
            duration = _time_to_seconds(row.get("total_call_duration"))

        call_id = (row.get("call_uuid") or "").strip()
        if not call_id or call_id.lower() in {"null", "none", "string"}:
            call_id = f"cdr-{row.get('id')}"

        payload.append(
            {
                "call_id": call_id[:128],
                "agent_id": agent[:128],
                "start_time": start_time,
                "end_time": start_time + timedelta(seconds=duration),
                "duration": duration,
                "recording_path": normalize_recording_url(recording, start_time),
                "created_at": datetime.utcnow(),
            }
        )

    print(f"[cdr] {client.name}: {len(payload)} auditable calls from {len(queues)} queue(s)")
    return payload


def list_cdr_sources() -> List[Dict[str, Any]]:
    """Return distinct queue names from the webhook log for the import UI.

    The result is cached briefly because the log table is large.
    """
    now = datetime.utcnow().timestamp()
    if _SOURCES_CACHE["data"] and now - _SOURCES_CACHE["at"] < _SOURCES_TTL_SECONDS:
        return _SOURCES_CACHE["data"]

    if SessionLocal2 is None:
        return []

    sql = text(
        """
        SELECT queue_name, COUNT(*) AS calls,
               MIN(date_time) AS first_call,
               MAX(date_time) AS last_call
        FROM cdr_webhook_logs
        WHERE date_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          AND COALESCE(queue_name, '') <> ''
        GROUP BY queue_name
        ORDER BY calls DESC
        """
    )

    db = SessionLocal2()
    try:
        rows = db.execute(sql).mappings().all()
    except Exception as exc:
        print(f"[cdr] source list failed: {exc}")
        return []
    finally:
        db.close()

    data: List[Dict[str, Any]] = []
    for row in rows:
        queue = _discard_ignored(row.get("queue_name"))
        if queue_key(queue) in _IGNORED_QUEUES:
            continue
        data.append(
            {
                "queue_name": queue,
                "calls": int(row.get("calls") or 0),
                "first_call": str(row.get("first_call") or ""),
                "last_call": str(row.get("last_call") or ""),
            }
        )

    _SOURCES_CACHE["at"] = now
    _SOURCES_CACHE["data"] = data
    return data
