import argparse
import asyncio
import sys
import time
from typing import Optional, Tuple

from sqlalchemy import select, text

from app.db.session import SessionLocal
from app.models.audit import CallAudit
from app.models.call_log import CallLog
from app.services.ai_audit_service import run_ai_audit
from app.services.audit_params import coerce_json
from app.services.scoring_service import derive_scoring

_MIGRATION_DONE = False


def _safe_console() -> None:
    """Never let a log line crash the worker on a cp1252 Windows console."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except Exception:
            pass


def _table_columns(db, table_name: str) -> set:
    try:
        cols = db.execute(text("""
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = :t
        """), {"t": table_name}).scalars().all()
        return set(cols or [])
    except Exception:
        return set()


def _ensure_audit_columns(db):
    cols = _table_columns(db, "call_audits")
    if not cols:
        return
    new_cols = [
        ("sale_category", "VARCHAR(50) DEFAULT 'Unknown'"),
        ("invalid_reason", "VARCHAR(255) DEFAULT NULL"),
        ("crm_sale_done", "BOOLEAN DEFAULT FALSE"),
        ("customer_confirmation", "VARCHAR(50) DEFAULT 'Not Confirmed'"),
        ("order_information", "VARCHAR(50) DEFAULT 'Not Available'"),
    ]
    added = []
    for col_name, col_def in new_cols:
        if col_name not in cols:
            try:
                db.execute(text(f"ALTER TABLE call_audits ADD COLUMN {col_name} {col_def}"))
                added.append(col_name)
            except Exception as e:
                print(f"[audit_worker] failed to add call_audits.{col_name}: {e}")
    if added:
        db.commit()
        print(f"[audit_worker] OK call_audits migration: added {added}")


def _ensure_call_log_columns(db):
    cols = _table_columns(db, "call_logs")
    if not cols:
        return
    new_cols = [
        ("sale_category", "VARCHAR(50) DEFAULT 'Unknown'"),
        ("invalid_reason", "VARCHAR(255) DEFAULT NULL"),
        ("crm_sale_done", "BOOLEAN DEFAULT FALSE"),
        ("customer_confirmation", "VARCHAR(50) DEFAULT 'Not Confirmed'"),
        ("order_information", "VARCHAR(50) DEFAULT 'Not Available'"),
    ]
    added = []
    for col_name, col_def in new_cols:
        if col_name not in cols:
            try:
                db.execute(text(f"ALTER TABLE call_logs ADD COLUMN {col_name} {col_def}"))
                added.append(col_name)
            except Exception as e:
                print(f"[audit_worker] failed to add call_logs.{col_name}: {e}")
    if added:
        db.commit()
        print(f"[audit_worker] OK call_logs migration: added {added}")


def _run_migrations(db):
    global _MIGRATION_DONE
    if _MIGRATION_DONE:
        return
    _ensure_audit_columns(db)
    _ensure_call_log_columns(db)
    _MIGRATION_DONE = True


def _load_prompt(db, client_id: int) -> Tuple[Optional[str], Optional[dict]]:
    """Return the active prompt text + JSON config for a client.

    Prompt Builder prompts live in `ai_prompts` (status = 'Active'). Legacy
    prompts live in `client_prompts` (is_active = 1) and have no JSON config,
    so they fall back to section detection in the audit service.
    """
    row = db.execute(
        text("""
            SELECT prompt_text, prompt_json FROM ai_prompts
            WHERE client_id = :client_id AND status = 'Active'
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
        """),
        {"client_id": client_id},
    ).mappings().one_or_none()

    if row and (row["prompt_text"] or "").strip():
        return row["prompt_text"], coerce_json(row["prompt_json"])

    legacy = db.execute(
        text("""
            SELECT prompt FROM client_prompts
            WHERE client_id = :client_id AND is_active = 1
            ORDER BY version DESC, id DESC
            LIMIT 1
        """),
        {"client_id": client_id},
    ).mappings().one_or_none()

    if legacy and (legacy["prompt"] or "").strip():
        return legacy["prompt"], None

    return None, None


def _apply_audit_fields(audit: CallAudit, call: CallLog, audit_json: dict) -> None:
    total_score, percentage, ranking, fatal_flag = derive_scoring(audit_json)

    sale_category = audit_json.get("sale_category") or "Unknown"
    invalid_reason = audit_json.get("invalid_reason")
    crm_sale_done = bool(audit_json.get("crm_sale_done", False))
    customer_confirmation = audit_json.get("customer_confirmation") or "Not Confirmed"
    order_information = audit_json.get("order_information") or "Not Available"

    if sale_category != "Invalid":
        invalid_reason = None

    audit.client_id = call.client_id
    audit.agent_id = call.agent_id
    audit.audit_json = audit_json
    audit.total_score = total_score
    audit.percentage = percentage
    audit.ranking = ranking
    audit.fatal_flag = fatal_flag
    audit.sale_category = sale_category
    audit.invalid_reason = invalid_reason
    audit.crm_sale_done = crm_sale_done
    audit.customer_confirmation = customer_confirmation
    audit.order_information = order_information


def run_once(limit: int = 20, client_id: Optional[int] = None, reaudit: bool = False) -> int:
    db = SessionLocal()
    try:
        _run_migrations(db)

        # ═══════════════════════════════════════════════════════
        # IMPORTANT: Skip voice_mail calls (they can't be audited)
        # ═══════════════════════════════════════════════════════
        query = (
            select(CallLog)
            .outerjoin(CallAudit, CallAudit.call_id == CallLog.call_id)
            .where(
                CallLog.transcript.is_not(None),
                CallLog.transcript != "",
                CallLog.transcript.not_in(
                    ["[TRANSCRIPT_FAILED]", "[RECORDING_MISSING]", "[NO_SPEECH]"]
                ),
                CallLog.voice_mail == False,  # ← Skip voicemail
            )
        )
        if client_id is not None:
            query = query.where(CallLog.client_id == client_id)
        if not reaudit:
            query = query.where(CallAudit.id.is_(None))
        else:
            query = query.where(CallAudit.id.is_not(None))

        calls = db.scalars(query.order_by(CallLog.call_id.desc()).limit(limit)).all()

        mode = "re-audit" if reaudit else "unaudited"
        print(f"[audit_worker] Found {len(calls)} {mode} non-voicemail calls")
        processed = 0
        skipped = 0

        for call in calls:
            prompt_text, prompt_config = _load_prompt(db, call.client_id)

            if not prompt_text:
                print(f"[audit_worker] SKIP no active prompt for client_id={call.client_id}, call={call.call_id}")
                skipped += 1
                continue

            try:
                audit_json = asyncio.run(
                    run_ai_audit(
                        prompt_text,
                        call.transcript or "",
                        call.voice_mail,
                        prompt_config=prompt_config,
                    )
                )
                if not audit_json:
                    print(f"[audit_worker] WARN empty audit_json for {call.call_id}")
                    skipped += 1
                    continue
            except Exception as exc:
                print(f"[audit_worker] FAIL {call.call_id}: {exc}")
                skipped += 1
                continue

            existing = db.scalar(
                select(CallAudit).where(CallAudit.call_id == call.call_id)
            )
            if existing is not None:
                _apply_audit_fields(existing, call, audit_json)
            else:
                audit = CallAudit(call_id=call.call_id)
                _apply_audit_fields(audit, call, audit_json)
                db.add(audit)

            try:
                db.execute(
                    text("""
                        UPDATE call_logs
                        SET sale_category = :sc,
                            invalid_reason = :ir,
                            crm_sale_done = :csd,
                            customer_confirmation = :cc,
                            order_information = :oi
                        WHERE call_id = :cid
                    """),
                    {
                        "sc": audit_json.get("sale_category") or "Unknown",
                        "ir": audit_json.get("invalid_reason"),
                        "csd": bool(audit_json.get("crm_sale_done", False)),
                        "cc": audit_json.get("customer_confirmation") or "Not Confirmed",
                        "oi": audit_json.get("order_information") or "Not Available",
                        "cid": call.call_id,
                    },
                )
            except Exception as exc:
                print(f"[audit_worker] call_logs update failed for {call.call_id}: {exc}")

            print(
                f"[audit_worker] OK {call.call_id} -> "
                f"{audit_json.get('sale_category') or 'Unknown'} "
                f"({audit_json.get('invalid_reason') or 'no reason'}) "
                f"| score={audit_json.get('total_score')}"
            )
            processed += 1

        db.commit()
        print(f"[audit_worker] Done. Processed={processed}, Skipped={skipped}")
        return processed
    finally:
        db.close()


def main() -> None:
    _safe_console()
    parser = argparse.ArgumentParser(description="Audit worker - processes unaudited calls.")
    parser.add_argument("--once", action="store_true", help="Run once and exit.")
    parser.add_argument("--interval", type=int, default=60, help="Loop interval in seconds.")
    parser.add_argument("--limit", type=int, default=20, help="Calls per run.")
    parser.add_argument("--client-id", type=int, default=None, help="Only process calls for this client.")
    parser.add_argument(
        "--reaudit",
        action="store_true",
        help="Re-audit calls that already have an audit row (updates in place).",
    )
    args = parser.parse_args()

    if args.once:
        run_once(limit=args.limit, client_id=args.client_id, reaudit=args.reaudit)
        return

    while True:
        try:
            run_once(limit=args.limit, client_id=args.client_id, reaudit=args.reaudit)
        except Exception as exc:
            print(f"[audit_worker] error: {exc}")
        time.sleep(max(1, args.interval))


if __name__ == "__main__":
    main()
