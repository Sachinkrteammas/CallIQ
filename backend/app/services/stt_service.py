import asyncio
from typing import Any

import httpx

from app.core.config import get_settings


VOICEMAIL_KEYWORDS = [
    "voice mail",
    "voicemail",
]


def is_voicemail(transcript: str) -> bool:
    transcript = transcript.lower().strip()

    # Normalize spaces
    transcript = " ".join(transcript.split())

    return any(
        keyword.lower() in transcript
        for keyword in VOICEMAIL_KEYWORDS
    )


def _extract_deepgram_transcript(payload: dict[str, Any]) -> str:
    results = payload.get("results", {})
    channels = results.get("channels", [])
    if not channels:
        return ""
    alternatives = channels[0].get("alternatives", [])
    if not alternatives:
        return ""
    return alternatives[0].get("transcript", "") or ""


def _deepgram_params() -> dict[str, str]:
    settings = get_settings()
    params: dict[str, str] = {
        "model": settings.stt_model,
        "smart_format": "true",
        "punctuate": "true",
        "paragraphs": "true",
        "utterances": "true",
        "diarize": "true",
    }
    if settings.stt_language:
        params["language"] = settings.stt_language
    return params


async def transcribe_audio(recording_path: str) -> dict[str, Any]:
    settings = get_settings()
    if settings.stt_mock_enabled:
        return {
            "transcript": f"[MOCK TRANSCRIPT] {recording_path}",
            "voice_mail": False,
        }

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
    if not transcript:
        raise RuntimeError("Transcription API did not include transcript")

    voice_mail = is_voicemail(transcript)

    return {
        "transcript": transcript,
        "voice_mail": voice_mail,
    }


async def transcribe_audio_bytes(
    audio_bytes: bytes,
    filename: str = "recording.wav",
    content_type: str = "audio/wav",
) -> str:
    settings = get_settings()
    if settings.stt_mock_enabled:
        return f"[MOCK TRANSCRIPT] {filename}"

    base_url = (getattr(settings, "stt_api_base_url", None) or "http://192.168.11.243:8030").rstrip("/")
    fname = filename.replace("\\", "/").split("/")[-1]
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

        transcript = ""
        for _ in range(60):
            try:
                status_resp = await client.get(
                    f"{base_url}/check-status", params={"fnames": fname}
                )
                status_resp.raise_for_status()
                tasks = status_resp.json().get("tasks", [])
                task = next((t for t in tasks if t.get("filename") == fname), None)
                if task and task.get("audio") is True and task.get("transcription") is True:
                    out_resp = await client.get(
                        f"{base_url}/get-output",
                        params={"fname": fname, "output_type": "transcription"},
                    )
                    out_resp.raise_for_status()
                    transcript = out_resp.text.strip()
                    break
            except httpx.HTTPError:
                pass
            await asyncio.sleep(2)

    if not transcript:
        raise RuntimeError("Transcription API did not return a transcript in time")
    return transcript