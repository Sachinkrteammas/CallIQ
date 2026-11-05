"""Repair legacy recording URLs in ``call_logs``.

Older rows stored the dialer-local URL
(``http://192.168.10.5/RECORDINGS/MP3/<file>``) which now returns 404.
This script rewrites them to the central recording mirror layout
(``http://192.168.10.3/192_168_10_5/<YYYYMMDD>/<file>``).

Usage:
    python -m scripts.fix_recording_paths             # dry run (default)
    python -m scripts.fix_recording_paths --apply     # write changes
    python -m scripts.fix_recording_paths --apply --requeue

``--requeue`` also clears the failure placeholders on rows whose URL changed,
so the STT worker retries them (age limits still apply).
"""

import argparse
from collections import Counter

from app.db.session import SessionLocal
from app.models.call_log import CallLog
from app.services.recording_url import normalize_recording_url

RETRYABLE_PLACEHOLDERS = {
    "[TRANSCRIPT_FAILED]",
    "[RECORDING_MISSING]",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Persist changes.")
    parser.add_argument(
        "--requeue",
        action="store_true",
        help="Clear failure placeholders on rows whose URL changed.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    changed = 0
    requeued = 0
    by_host: Counter[str] = Counter()

    try:
        rows = db.query(CallLog).filter(CallLog.recording_path.isnot(None)).all()
        for call in rows:
            old = (call.recording_path or "").strip()
            if not old:
                continue
            new = normalize_recording_url(old, call.start_time)
            if not new or new == old:
                continue

            host = old.split("/")[2] if old.startswith("http") and len(old.split("/")) > 2 else "?"
            by_host[host] += 1
            changed += 1

            if changed <= 5:
                print(f"[dry-run] {call.call_id}\n  old: {old}\n  new: {new}")

            if args.apply:
                call.recording_path = new
                if args.requeue and (call.transcript or "") in RETRYABLE_PLACEHOLDERS:
                    call.transcript = None
                    call.voice_mail = False
                    requeued += 1

        if args.apply:
            db.commit()

        print("\nSummary")
        print(f"  rows scanned : {len(rows)}")
        print(f"  to update    : {changed}")
        for host, count in by_host.most_common():
            print(f"    {host}: {count}")
        if args.apply:
            print(f"  updated      : {changed}")
            print(f"  requeued     : {requeued}")
        else:
            print("  (dry run — rerun with --apply to persist)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
