import argparse
import asyncio
import time

from sqlalchemy import select, text

from app.db.session import SessionLocal
from app.models.audit import CallAudit
from app.models.call_log import CallLog
from app.services.ai_audit_service import run_ai_audit
from app.services.scoring_service import derive_scoring

_MIGRATION_DONE = False


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
        print(f"[audit_worker] ✅ call_audits migration: added {added}")


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
        print(f"[audit_worker] ✅ call_logs migration: added {added}")


def _run_migrations(db):
    global _MIGRATION_DONE
    if _MIGRATION_DONE:
        return
    _ensure_audit_columns(db)
    _ensure_call_log_columns(db)
    _MIGRATION_DONE = True


def run_once(limit: int = 20) -> int:
    db = SessionLocal()
    try:
        _run_migrations(db)

        # ═══════════════════════════════════════════════════════
        # IMPORTANT: Skip voice_mail calls (they can't be audited)
        # ═══════════════════════════════════════════════════════
        calls = db.scalars(
            select(CallLog)
            .outerjoin(CallAudit, CallAudit.call_id == CallLog.call_id)
            .where(
                CallLog.transcript.is_not(None),
                CallLog.voice_mail == False,  # ← NEW: Skip voicemail
                CallAudit.id.is_(None),
            )
            .limit(limit)
        ).all()

        print(f"[audit_worker] Found {len(calls)} unaudited non-voicemail calls")
        processed = 0
        skipped = 0

        for call in calls:
            prompt_row = db.execute(
                text("""
                    SELECT prompt_text FROM ai_prompts
                    WHERE client_id = :client_id AND status = 'Active'
                    ORDER BY updated_at DESC
                    LIMIT 1
                """),
                {"client_id": call.client_id},
            ).mappings().one_or_none()

            if not prompt_row or not (prompt_row["prompt_text"] or "").strip():
                print(f"[audit_worker] ⏭️  No active prompt for client_id={call.client_id}, skipping {call.call_id}")
                skipped += 1
                continue

            try:
                audit_json = asyncio.run(
                    run_ai_audit(prompt_row["prompt_text"], call.transcript or "", call.voice_mail)
                )
                if not audit_json:
                    print(f"[audit_worker] ⚠️  Empty audit_json for {call.call_id}")
                    skipped += 1
                    continue
            except Exception as exc:
                print(f"[audit_worker] ❌ Failed {call.call_id}: {exc}")
                skipped += 1
                continue

            total_score, percentage, ranking, fatal_flag = derive_scoring(audit_json)

            sale_category = audit_json.get("sale_category") or "Unknown"
            invalid_reason = audit_json.get("invalid_reason")
            crm_sale_done = bool(audit_json.get("crm_sale_done", False))
            customer_confirmation = audit_json.get("customer_confirmation") or "Not Confirmed"
            order_information = audit_json.get("order_information") or "Not Available"

            if sale_category != "Invalid":
                invalid_reason = None

            db.add(
                CallAudit(
                    call_id=call.call_id,
                    client_id=call.client_id,
                    agent_id=call.agent_id,
                    audit_json=audit_json,
                    total_score=total_score,
                    percentage=percentage,
                    ranking=ranking,
                    fatal_flag=fatal_flag,
                    sale_category=sale_category,
                    invalid_reason=invalid_reason,
                    crm_sale_done=crm_sale_done,
                    customer_confirmation=customer_confirmation,
                    order_information=order_information,
                )
            )

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
                        "sc": sale_category,
                        "ir": invalid_reason,
                        "csd": crm_sale_done,
                        "cc": customer_confirmation,
                        "oi": order_information,
                        "cid": call.call_id,
                    },
                )
            except Exception as exc:
                print(f"[audit_worker] call_logs update failed for {call.call_id}: {exc}")

            print(f"[audit_worker] ✅ {call.call_id} → {sale_category} ({invalid_reason or 'no reason'}) | score={total_score}")
            processed += 1

        db.commit()
        print(f"[audit_worker] 🎉 Processed={processed}, Skipped={skipped}")
        return processed
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit worker — processes unaudited calls.")
    parser.add_argument("--once", action="store_true", help="Run once and exit.")
    parser.add_argument("--interval", type=int, default=60, help="Loop interval in seconds.")
    parser.add_argument("--limit", type=int, default=20, help="Calls per run.")
    args = parser.parse_args()

    if args.once:
        run_once(limit=args.limit)
        return

    while True:
        try:
            run_once(limit=args.limit)
        except Exception as exc:
            print(f"[audit_worker] error: {exc}")
        time.sleep(max(1, args.interval))


if __name__ == "__main__":
    main()