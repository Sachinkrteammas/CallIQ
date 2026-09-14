import argparse
import asyncio
import time

from sqlalchemy import select, text

from app.db.session import SessionLocal
from app.models.audit import CallAudit
from app.models.call_log import CallLog
from app.services.ai_audit_service import run_ai_audit
from app.services.scoring_service import derive_scoring


def run_once(limit: int = 20) -> int:
    db = SessionLocal()
    try:
        calls = db.scalars(
            select(CallLog)
            .outerjoin(CallAudit, CallAudit.call_id == CallLog.call_id)
            .where(CallLog.transcript.is_not(None), CallAudit.id.is_(None))
            .limit(limit)
        ).all()
        processed = 0

        for call in calls:
            prompt_row = db.execute(
                text("""
                    SELECT prompt_text
                    FROM ai_prompts
                    WHERE client_id = :client_id AND status = 'Active'
                    ORDER BY updated_at DESC
                    LIMIT 1
                """),
                {"client_id": call.client_id},
            ).mappings().one_or_none()
            if not prompt_row or not (prompt_row["prompt_text"] or "").strip():
                print(f"[audit_worker] no active prompt for client_id={call.client_id}, skipping call_id={call.call_id}")
                continue

            try:
                audit_json = asyncio.run(run_ai_audit(prompt_row["prompt_text"], call.transcript or "", call.voice_mail))

                if not audit_json:
                    continue

            except Exception as exc:
                print(f"[audit_worker] failed call_id={call.call_id}: {exc}")
                continue

            total_score, percentage, ranking, fatal_flag = derive_scoring(audit_json)
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
                )
            )
            processed += 1

        db.commit()
        print(f"[audit_worker] processed={processed}")
        return processed
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Manual audit worker (no Celery).")
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