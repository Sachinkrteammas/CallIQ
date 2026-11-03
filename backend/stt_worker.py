import argparse
import asyncio
import time
from datetime import datetime, timedelta

import httpx
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.call_log import CallLog
from app.services.stt_service import transcribe_audio

# Transcript placeholders for calls that can never be transcribed.
# They are written once and never retried.
MISSING_RECORDING = "[RECORDING_MISSING]"
NO_SPEECH = "[NO_SPEECH]"


def _ist_now() -> datetime:
    """call_logs.start_time is stored as naive IST (see dialer_service)."""
    return datetime.utcnow() + timedelta(hours=5, minutes=30)


def run_once(limit: int = 20, max_age_hours: int = 48) -> int:
    db = SessionLocal()
    try:
        stmt = (
            select(CallLog)
            .where(CallLog.transcript.is_(None) | (CallLog.transcript == ""))
            .order_by(CallLog.start_time.desc())
            .limit(limit)
        )

        # Old recordings are purged from the dialer, so never pick them up.
        if max_age_hours > 0:
            stmt = stmt.where(
                CallLog.start_time >= _ist_now() - timedelta(hours=max_age_hours)
            )

        calls = db.scalars(stmt).all()

        processed = 0
        ok = 0
        skipped = 0
        failed = 0

        for call in calls:
            if not call.recording_path:
                call.transcript = MISSING_RECORDING
                call.voice_mail = False
                failed += 1
                processed += 1
                continue

            try:
                result = asyncio.run(transcribe_audio(call.recording_path))

                transcript = result["transcript"]
                voice_mail = result["voice_mail"]

                if not transcript.strip():
                    # Silent / ring-only recording: nothing to audit.
                    call.transcript = NO_SPEECH
                    call.voice_mail = False
                    skipped += 1
                else:
                    call.transcript = transcript
                    call.voice_mail = voice_mail
                    ok += 1

            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                print(
                    f"[stt_worker] failed call_id={call.call_id} "
                    f"(HTTP {status}): {exc.request.url}"
                )
                failed += 1
                if status in (404, 410):
                    # Recording already purged from the dialer, retrying is useless.
                    call.transcript = MISSING_RECORDING
                    call.voice_mail = False
                else:
                    print(f"[stt_worker] will retry call_id={call.call_id}")

            except Exception as exc:
                # Transient failure (network / STT service) -> retry next run,
                # it is dropped automatically once it is older than max-age.
                print(f"[stt_worker] failed call_id={call.call_id} (will retry): {exc}")
                failed += 1

            processed += 1

        db.commit()
        print(
            f"[stt_worker] processed={processed} ok={ok} no_speech={skipped} "
            f"failed={failed} max_age_hours={max_age_hours}"
        )
        return processed
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Manual STT worker (no Celery).")
    parser.add_argument("--once", action="store_true", help="Run once and exit.")
    parser.add_argument("--interval", type=int, default=60, help="Loop interval in seconds.")
    parser.add_argument("--limit", type=int, default=20, help="Calls per run.")
    parser.add_argument(
        "--max-age-hours",
        type=int,
        default=48,
        help="Skip calls older than this (recordings get purged). 0 = no limit.",
    )
    args = parser.parse_args()

    if args.once:
        run_once(limit=args.limit, max_age_hours=args.max_age_hours)
        return

    while True:
        try:
            run_once(limit=args.limit, max_age_hours=args.max_age_hours)
        except Exception as exc:
            print(f"[stt_worker] error: {exc}")
        time.sleep(max(1, args.interval))


if __name__ == "__main__":
    main()
