"""
ESM VAD — Recording Analysis Pipeline
--------------------------------------
Reads call_logs entries (recording_path is an HTTP URL), downloads the MP3,
runs VAD + lightweight diarization, computes 8 behavioural metrics, and
inserts a row into call_vad_metrics.

Usage:
    # Process all unprocessed calls (backfill)
    python -m scripts.process_vad --backfill

    # Process specific client + date range
    python -m scripts.process_vad --client-id 23 --from-date 2026-09-01 --to-date 2026-10-07

    # Process a single call
    python -m scripts.process_vad --call-id SAATVIKGREENENE00000-24587207

    # Continuous loop (every 5 min)
    python -m scripts.process_vad --loop --interval 300
"""
import argparse
import logging
import os
import tempfile
import time
from datetime import date
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import numpy as np
import requests
import webrtcvad
from pydub import AudioSegment
from sqlalchemy import text

from app.database import SessionLocal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [VAD] %(levelname)s %(message)s",
)
log = logging.getLogger("vad")

SAMPLE_RATE = 16000
FRAME_MS = 30
FRAME_SAMPLES = int(SAMPLE_RATE * FRAME_MS / 1000)

DEAD_AIR_MIN_SEC = 3.0
INTERRUPTION_WINDOW_SEC = 0.4

SCRIPT_KEYWORDS = (
    "thank you for calling", "how may i help", "my name is", "is there anything else",
)
ESCALATION_KEYWORDS = (
    "supervisor", "manager", "escalate", "transfer", "complaint", "legal",
)


# ─── Fetch audio from HTTP URL ──────────────────────────────────────────────
def download_audio(url: str, timeout: int = 30) -> Optional[str]:
    """Download MP3 from URL into a temp file. Returns temp path or None.

    Handles 404 (file missing on server) and connection errors gracefully.
    """
    if not url or not url.lower().startswith(("http://", "https://")):
        log.warning("Invalid URL: %s", url)
        return None

    try:
        r = requests.get(url, timeout=timeout, stream=True)
        if r.status_code == 404:
            log.warning("404 (file missing on server) — %s", url)
            return None
        if r.status_code >= 400:
            log.warning("HTTP %d — %s", r.status_code, url)
            return None
    except requests.exceptions.ConnectionError as e:
        log.warning("Connection error — %s (%s)", url, e)
        return None
    except requests.exceptions.Timeout:
        log.warning("Timeout — %s", url)
        return None
    except Exception as e:
        log.error("Download failed — %s (%s)", url, e)
        return None

    suffix = Path(urlparse(url).path).suffix or ".mp3"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        for chunk in r.iter_content(chunk_size=8192):
            if chunk:
                tmp.write(chunk)
        tmp.close()
        return tmp.name
    except Exception as e:
        log.error("Write failed: %s", e)
        tmp.close()
        try:
            os.unlink(tmp.name)
        except Exception:
            pass
        return None


# ─── Load audio → 16kHz mono int16 numpy array ─────────────────────────────
def load_audio_from_file(path: str) -> Optional[np.ndarray]:
    """Load MP3/WAV → 16kHz mono int16 numpy array via pydub (needs ffmpeg)."""
    try:
        audio = AudioSegment.from_file(path)
        audio = audio.set_frame_rate(SAMPLE_RATE).set_channels(1).set_sample_width(2)
        samples = np.array(audio.get_array_of_samples(), dtype=np.int16)
        return samples
    except Exception as e:
        log.error("Audio load failed for %s: %s", path, e)
        return None


# ─── VAD ────────────────────────────────────────────────────────────────────
def run_vad(audio: np.ndarray, aggressiveness: int = 2) -> np.ndarray:
    vad = webrtcvad.Vad(aggressiveness)
    n_frames = len(audio) // FRAME_SAMPLES
    mask = np.zeros(n_frames, dtype=bool)
    for i in range(n_frames):
        frame = audio[i * FRAME_SAMPLES:(i + 1) * FRAME_SAMPLES]
        try:
            mask[i] = vad.is_speech(frame.tobytes(), SAMPLE_RATE)
        except Exception:
            mask[i] = False
    return mask


# ─── Diarization (lightweight fallback) ─────────────────────────────────────
def run_diarization(speech_mask: np.ndarray) -> np.ndarray:
    """Alternate 2 speakers on each contiguous speech burst."""
    labels = np.full(len(speech_mask), -1, dtype=int)
    current_speaker = 0
    last_speech = False
    for i, is_speech in enumerate(speech_mask):
        if is_speech:
            if not last_speech:
                current_speaker = 1 - current_speaker
            labels[i] = current_speaker
        last_speech = is_speech
    return labels


# ─── Metric computation ─────────────────────────────────────────────────────
def frame_to_seconds(n: int) -> float:
    return n * FRAME_MS / 1000.0


def compute_metrics(speech_mask: np.ndarray, speaker_labels: np.ndarray) -> dict:
    total_sec = frame_to_seconds(len(speech_mask))
    if total_sec <= 0:
        return {k: 0.0 for k in (
            "dead_air_pct", "long_hold_sec", "interruptions",
            "talk_ratio_pct", "silence_pct", "cross_talk_pct",
            "escalation_pct", "script_deviation_pct",
        )}

    silence_frames = len(speech_mask) - int(speech_mask.sum())
    silence_sec = frame_to_seconds(silence_frames)

    dead_air_frames = 0
    longest_silence = 0
    cur_silence = 0
    for is_speech in speech_mask:
        if not is_speech:
            cur_silence += 1
        else:
            if cur_silence > longest_silence:
                longest_silence = cur_silence
            if frame_to_seconds(cur_silence) >= DEAD_AIR_MIN_SEC:
                dead_air_frames += cur_silence
            cur_silence = 0
    if cur_silence > longest_silence:
        longest_silence = cur_silence
    if frame_to_seconds(cur_silence) >= DEAD_AIR_MIN_SEC:
        dead_air_frames += cur_silence

    dead_air_pct = dead_air_frames / max(1, len(speech_mask)) * 100
    long_hold_sec = frame_to_seconds(longest_silence)
    silence_pct = silence_sec / total_sec * 100

    agent_frames = int((speaker_labels == 0).sum())
    customer_frames = int((speaker_labels == 1).sum())
    total_talk = max(1, agent_frames + customer_frames)
    talk_ratio_pct = agent_frames / total_talk * 100

    interruptions = 0
    last_speaker = -1
    gap_since_last = 0
    for lbl in speaker_labels:
        if lbl == -1:
            gap_since_last += 1
            continue
        if last_speaker != -1 and lbl != last_speaker:
            if frame_to_seconds(gap_since_last) <= INTERRUPTION_WINDOW_SEC:
                interruptions += 1
        last_speaker = lbl
        gap_since_last = 0

    cross_talk_frames = 0
    for i in range(1, len(speaker_labels)):
        a, b = speaker_labels[i - 1], speaker_labels[i]
        if a != -1 and b != -1 and a != b:
            cross_talk_frames += 1
    cross_talk_pct = cross_talk_frames / max(1, len(speaker_labels)) * 100

    return {
        "dead_air_pct": round(float(dead_air_pct), 2),
        "long_hold_sec": round(float(long_hold_sec), 2),
        "interruptions": round(float(interruptions), 2),
        "talk_ratio_pct": round(float(talk_ratio_pct), 2),
        "silence_pct": round(float(silence_pct), 2),
        "cross_talk_pct": round(float(cross_talk_pct), 2),
        "escalation_pct": 0.0,
        "script_deviation_pct": 0.0,
    }


def compute_text_metrics(transcript: str) -> dict:
    if not transcript:
        return {"escalation_pct": 0.0, "script_deviation_pct": 0.0}
    low = transcript.lower()
    words = max(1, len(low.split()))
    esc_hits = sum(low.count(k) for k in ESCALATION_KEYWORDS)
    escalation_pct = min(100.0, esc_hits / words * 1000)
    present = sum(1 for k in SCRIPT_KEYWORDS if k in low)
    script_deviation_pct = max(0.0, (1 - present / len(SCRIPT_KEYWORDS)) * 100)
    return {
        "escalation_pct": round(escalation_pct, 2),
        "script_deviation_pct": round(script_deviation_pct, 2),
    }


# ─── DB helpers ─────────────────────────────────────────────────────────────
def _base_select():
    return """
        SELECT cl.call_id, cl.client_id, cl.recording_path, cl.transcript,
               DATE(cl.created_at) AS call_date,
               CASE WHEN COALESCE(c.ingroups, '') = '' THEN 'Sales' ELSE 'Service' END AS client_type
        FROM call_logs cl
        LEFT JOIN clients c ON c.id = cl.client_id
    """


def fetch_unprocessed_calls(db, limit: int = 20, client_id: int = None,
                            from_date: str = None, to_date: str = None):
    where = [
        "cl.recording_path IS NOT NULL",
        "cl.recording_path != ''",
        "cl.call_id NOT IN (SELECT call_id FROM call_vad_metrics)",
    ]
    params = {"limit": limit}
    if client_id is not None:
        where.append("cl.client_id = :client_id")
        params["client_id"] = client_id
    if from_date:
        where.append("DATE(cl.created_at) >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append("DATE(cl.created_at) <= :to_date")
        params["to_date"] = to_date

    sql = text(_base_select() + " WHERE " + " AND ".join(where) +
               " ORDER BY cl.created_at DESC LIMIT :limit")
    return db.execute(sql, params).mappings().all()


def fetch_call(db, call_id: str):
    sql = text(_base_select() + " WHERE cl.call_id = :call_id LIMIT 1")
    return db.execute(sql, {"call_id": call_id}).mappings().one_or_none()


def insert_vad_metrics(db, row: dict, metrics: dict):
    sql = text("""
        INSERT INTO call_vad_metrics
            (call_id, client_id, client_type, call_date,
             dead_air_pct, long_hold_sec, interruptions, talk_ratio_pct,
             silence_pct, cross_talk_pct, escalation_pct, script_deviation_pct)
        VALUES
            (:call_id, :client_id, :client_type, :call_date,
             :dead_air_pct, :long_hold_sec, :interruptions, :talk_ratio_pct,
             :silence_pct, :cross_talk_pct, :escalation_pct, :script_deviation_pct)
        ON DUPLICATE KEY UPDATE
            dead_air_pct = VALUES(dead_air_pct),
            long_hold_sec = VALUES(long_hold_sec),
            interruptions = VALUES(interruptions),
            talk_ratio_pct = VALUES(talk_ratio_pct),
            silence_pct = VALUES(silence_pct),
            cross_talk_pct = VALUES(cross_talk_pct),
            escalation_pct = VALUES(escalation_pct),
            script_deviation_pct = VALUES(script_deviation_pct)
    """)
    db.execute(sql, {
        "call_id": row["call_id"],
        "client_id": int(row["client_id"]),
        "client_type": row["client_type"] or "Sales",
        "call_date": row["call_date"] or date.today(),
        **metrics,
    })
    db.commit()


# ─── Orchestrator ───────────────────────────────────────────────────────────
def process_call(db, row) -> bool:
    log.info("Processing %s", row["call_id"])
    tmp_path = download_audio(row["recording_path"])
    if not tmp_path:
        log.warning("Skipping %s (no audio / 404)", row["call_id"])
        return False

    try:
        audio = load_audio_from_file(tmp_path)
        if audio is None or len(audio) < SAMPLE_RATE:
            log.warning("Skipping %s — unusable audio", row["call_id"])
            return False

        speech_mask = run_vad(audio)
        speaker_labels = run_diarization(speech_mask)
        metrics = compute_metrics(speech_mask, speaker_labels)

        if row["transcript"]:
            metrics.update(compute_text_metrics(row["transcript"]))

        insert_vad_metrics(db, row, metrics)
        log.info("✓ %s → dead_air=%.1f%% silence=%.1f%% talk_ratio=%.1f%%",
                 row["call_id"], metrics["dead_air_pct"],
                 metrics["silence_pct"], metrics["talk_ratio_pct"])
        return True
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def backfill(db, batch: int = 20, client_id: int = None,
             from_date: str = None, to_date: str = None):
    processed = 0
    while True:
        rows = fetch_unprocessed_calls(db, limit=batch,
                                       client_id=client_id,
                                       from_date=from_date, to_date=to_date)
        if not rows:
            break
        for row in rows:
            try:
                if process_call(db, row):
                    processed += 1
            except Exception as e:
                log.exception("Failed on %s: %s", row["call_id"], e)
    log.info("Backfill complete. Processed %d calls.", processed)


def loop_forever(interval: int = 300):
    log.info("VAD worker started, polling every %ds", interval)
    while True:
        db = SessionLocal()
        try:
            rows = fetch_unprocessed_calls(db, limit=10)
            for row in rows:
                try:
                    process_call(db, row)
                except Exception as e:
                    log.exception("Failed on %s: %s", row["call_id"], e)
        finally:
            db.close()
        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--call-id", help="Process a single call")
    parser.add_argument("--client-id", type=int, help="Process only this client")
    parser.add_argument("--from-date", help="YYYY-MM-DD")
    parser.add_argument("--to-date", help="YYYY-MM-DD")
    parser.add_argument("--backfill", action="store_true")
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--interval", type=int, default=300)
    args = parser.parse_args()

    if args.loop:
        loop_forever(args.interval)
        return

    db = SessionLocal()
    try:
        if args.call_id:
            row = fetch_call(db, args.call_id)
            if not row:
                log.error("Call not found: %s", args.call_id)
                return
            process_call(db, row)
        elif args.backfill or args.client_id:
            backfill(db, client_id=args.client_id,
                     from_date=args.from_date, to_date=args.to_date)
        else:
            parser.print_help()
    finally:
        db.close()


if __name__ == "__main__":
    main()