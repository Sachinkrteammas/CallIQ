import argparse
import asyncio
import time

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.call_log import CallLog
from app.services.stt_service import transcribe_audio


def run_once(limit: int = 20) -> int:
    db = SessionLocal()
    try:
        calls = db.scalars(select(CallLog).where(CallLog.transcript.is_(None) | (CallLog.transcript == "")).limit(limit)).all()
        processed = 0
        for call in calls:
            try:
                if not call.recording_path:
                    raise RuntimeError("Recording path missing")

                result = asyncio.run(transcribe_audio(call.recording_path))

                transcript = result["transcript"]
                voice_mail = result["voice_mail"]

                if not transcript.strip():
                    raise RuntimeError("Empty transcript returned")
                call.transcript = transcript

                call.voice_mail = voice_mail

            except Exception as exc:
                print(f"[stt_worker] failed call_id={call.call_id}: {exc}")
                call.transcript = "[TRANSCRIPT_FAILED]"
                call.voice_mail = False

            processed += 1
        db.commit()
        print(f"[stt_worker] processed={processed}")
        return processed
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Manual STT worker (no Celery).")
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
            print(f"[stt_worker] error: {exc}")
        time.sleep(max(1, args.interval))


if __name__ == "__main__":
    main()