import asyncio
from datetime import datetime
from typing import Any, Dict, Optional

import httpx

from app.core.config import get_settings
from app.services.recording_url import normalize_recording_url


VOICEMAIL_KEYWORDS = [
    "voice mail",
    "voicemail",
]


def is_voicemail(transcript: str) -> bool:
    transcript = (transcript or "").lower().strip()
    transcript = " ".join(transcript.split())
    return any(keyword.lower() in transcript for keyword in VOICEMAIL_KEYWORDS)


def _extract_deepgram_transcript(payload: Dict[str, Any]) -> str:
    results = payload.get("results", {})
    channels = results.get("channels", [])
    if not channels:
        return ""
    alternatives = channels[0].get("alternatives", [])
    if not alternatives:
        return ""
    return alternatives[0].get("transcript", "") or ""


def _deepgram_params() -> Dict[str, str]:
    settings = get_settings()
    params: Dict[str, str] = {
        "model": getattr(settings, "stt_model", ""),
        "smart_format": "true",
        "punctuate": "true",
        "paragraphs": "true",
        "utterances": "true",
        "diarize": "true",
    }
    language = getattr(settings, "stt_language", None)
    if language:
        params["language"] = language
    return params


async def transcribe_audio(
    recording_path: str,
    call_time: Optional[datetime] = None,
) -> Dict[str, Any]:
    settings = get_settings()
    if getattr(settings, "stt_mock_enabled", False):
        return {
            "transcript": f"[MOCK TRANSCRIPT] {recording_path}",
            "voice_mail": False,
        }

    # Normalize recording URL/path when helper supports call_time context
    try:
        recording_path = normalize_recording_url(recording_path, call_time)
    except TypeError:
        recording_path = normalize_recording_url(recording_path)

    if recording_path.startswith(("http://", "https://")):
        async with httpx.AsyncClient(timeout=180.0) as client:
            audio_resp = await client.get(recording_path)
            audio_resp.raise_for_status()
            audio_bytes = audio_resp.content
    else:
        with open(recording_path, "rb") as file_obj:
            audio_bytes = file_obj.read()

    transcript = await transcribe_audio_bytes(
        audio_bytes=audio_bytes,
        filename=recording_path,
        content_type="application/octet-stream",
    )

    # Empty transcript is valid (silence / ring-only calls). The worker
    # stores it as "[NO_SPEECH]" instead of endlessly retrying.
    voice_mail = is_voicemail(transcript)

    return {
        "transcript": transcript or "",
        "voice_mail": voice_mail,
    }


async def transcribe_audio_bytes(
    audio_bytes: bytes,
    filename: str = "recording.wav",
    content_type: str = "audio/wav",
    poll_timeout: float = 300.0,
    poll_interval: float = 2.0,
) -> str:
    settings = get_settings()
    if getattr(settings, "stt_mock_enabled", False):
        return f"[MOCK TRANSCRIPT] {filename}"

    base_url = (getattr(settings, "stt_api_base_url", None) or "http://192.168.11.243:8030").rstrip("/")
    fname = filename.replace("\\", "/").split("/")[-1] or "recording.wav"
    upload_content_type = content_type or "audio/mpeg"
    files = {"fh": (fname, audio_bytes, upload_content_type)}
    data = {
        "prompt_analysis": "string",
        "prompt_json": "string",
        "schema_json": "{}",
        "overwrite": "true",
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        upload_resp = await client.post(f"{base_url}/audio/upload", files=files, data=data)
        upload_resp.raise_for_status()

        loop = asyncio.get_running_loop()
        deadline = loop.time() + poll_timeout
        ready = False
        empty_reads = 0

        while loop.time() < deadline:
            try:
                status_resp = await client.get(f"{base_url}/check-status", params={"fnames": fname})
                status_resp.raise_for_status()
                tasks = status_resp.json().get("tasks", [])
                task = next((t for t in tasks if t.get("filename") == fname), None)
                if task and task.get("audio") is True and task.get("transcription") is True:
                    ready = True
                    out_resp = await client.get(
                        f"{base_url}/get-output",
                        params={"fname": fname, "output_type": "transcription"},
                    )
                    out_resp.raise_for_status()
                    transcript = out_resp.text.strip()
                    if transcript:
                        return transcript
                    # Output can lag behind the status flag; retry a few times
                    # before accepting that the recording has no speech.
                    empty_reads += 1
                    if empty_reads >= 5:
                        return ""
            except httpx.HTTPError:
                pass
            await asyncio.sleep(poll_interval)

    if ready:
        return ""

    raise RuntimeError(f"Transcription API did not return a transcript in time for {fname}")

    # ===== Old Deepgram implementation (kept for reference) =====
    # if not settings.stt_api_key:
    #     raise RuntimeError("STT_API_KEY is missing in backend/.env")
    #
    # upload_content_type = content_type or "application/octet-stream"
    # if upload_content_type == "audio/wav":
    #     upload_content_type = "application/octet-stream"
    # headers = {"Authorization": f"Token {settings.stt_api_key}", "Content-Type": upload_content_type}
    #
    # async with httpx.AsyncClient(timeout=180.0) as client:
    #     response = await client.post(
    #         settings.stt_api_url,
    #         headers=headers,
    #         params=_deepgram_params(),
    #         content=audio_bytes,
    #     )
    #     response.raise_for_status()
    #
    # transcript = _extract_deepgram_transcript(response.json())
    # if not transcript:
    #     raise RuntimeError("Deepgram response did not include transcript")
    # return transcript
