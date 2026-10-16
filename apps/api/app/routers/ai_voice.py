"""Aladin voice — server-side speech so Bangla works on every device.

Browser speech engines depend on the OS (macOS has no Bangla voice; Safari cannot recognise
Bangla), so voice goes through the Aladin engine instead:

  POST /ai/voice/transcribe  multipart audio (+ language)  → {"text": …}
  POST /ai/voice/speak       {"text", "language", "voice"}  → audio/mpeg

Both use the company's Aladin key (AI → Settings, or OPENAI_API_KEY) and the same access
rules as chat. Audio is forwarded once and not stored. If no key is configured the
endpoints answer 503 and the client falls back to the browser's own engine.
"""

from __future__ import annotations

import re
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps.auth import get_current_user
from app.models.auth_user import AuthUser
from app.services.ai.ai_key_service import resolve_openai_key
from app.services.ai.entitlements import ai_access_allowed
from app.services.ai.providers.openai_provider import DEFAULT_BASE_URL, NOT_CONFIGURED, _brand

# Mounted under ai_gateway's router (prefix /ai) → /api/v1/ai/voice/…
router = APIRouter(prefix="/voice", tags=["ai"])

MAX_AUDIO_BYTES = 12 * 1024 * 1024
MAX_SPEECH_CHARS = 3000
TRANSCRIBE_MODELS = ("gpt-4o-mini-transcribe", "whisper-1")
TTS_MODELS = ("gpt-4o-mini-tts", "tts-1")
TTS_VOICES = {"alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"}
LANG_CODES = {"bn": "bn", "en": "en"}


def _engine(db: Session, company_id: str) -> tuple[str, str]:
    key, _ = resolve_openai_key(db, company_id)
    if not key:
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED)
    base = (get_settings().openai_base_url or DEFAULT_BASE_URL).rstrip("/")
    return key, base


def _openai_error(res: httpx.Response, what: str) -> HTTPException:
    detail = res.text[:300]
    try:
        detail = res.json().get("error", {}).get("message", detail)
    except Exception:  # noqa: BLE001
        pass
    return HTTPException(status_code=502, detail=f"Aladin {what} failed: {_brand(str(detail))}")


def _speech_text(text: str) -> str:
    """Markdown → something worth reading aloud."""
    t = re.sub(r"```[\s\S]*?```", " ", text)
    t = re.sub(r"`([^`]+)`", r"\1", t)
    t = re.sub(r"^\s*\|?[\s:|-]+\|\s*$", "", t, flags=re.M)
    t = t.replace("|", ", ")
    t = re.sub(r"^#{1,6}\s+", "", t, flags=re.M)
    t = re.sub(r"\*\*([^*]+)\*\*", r"\1", t)
    t = re.sub(r"\*([^*]+)\*", r"\1", t)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)
    t = re.sub(r"^\s*[-*•]\s+", "", t, flags=re.M)
    t = re.sub(r"\n{2,}", ". ", t)
    return re.sub(r"\s+", " ", t).strip()


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(default=None),
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    allowed, status = ai_access_allowed()
    if not allowed:
        raise HTTPException(status_code=403, detail=f"AI access is not enabled for this workspace ({status})")
    key, base = _engine(db, user.company_id)
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Recording is too long — keep it under a couple of minutes.")
    filename = audio.filename or "speech.webm"
    content_type = audio.content_type or "audio/webm"
    wanted = (language or "").lower()
    lang = LANG_CODES.get(wanted)  # None = auto-detect (Bangla, English, mixed)
    prompt = None
    if wanted == "banglish":
        # Bangla speech, but written the way people chat: Latin letters, not Bangla script.
        lang = "bn"
        prompt = "Bangla speech transcribed in Banglish (Latin letters), e.g. 'ei mashe amader total sales koto, kon customer er overdue ache'. Keep numbers as digits."
    elif wanted == "bn":
        prompt = "বাংলা কথা; টাকার অঙ্ক ও সংখ্যা ডিজিটে লিখুন, যেমন BDT 26,350.00"

    last_error: Optional[HTTPException] = None
    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0)) as client:
        for model in TRANSCRIBE_MODELS:
            form: dict = {"model": model, "response_format": "json"}
            if lang:
                form["language"] = lang
            if prompt:
                form["prompt"] = prompt
            try:
                res = await client.post(
                    f"{base}/audio/transcriptions",
                    headers={"Authorization": f"Bearer {key}"},
                    data=form,
                    files={"file": (filename, data, content_type)},
                )
            except httpx.HTTPError as exc:
                raise HTTPException(status_code=502, detail=f"Aladin voice is unreachable ({exc.__class__.__name__}).") from exc
            if res.status_code == 404 or (res.status_code == 400 and "model" in res.text.lower()):
                last_error = _openai_error(res, "transcription")
                continue
            if res.status_code >= 400:
                raise _openai_error(res, "transcription")
            body = res.json()
            text = (body.get("text") or "").strip()
            if wanted == "banglish" and re.search(r"[ঀ-৿]", text):
                text = await _romanize(client, key, base, text)
            return {"text": text, "model": model, "language": wanted or "auto"}
    raise last_error or HTTPException(status_code=502, detail="Aladin transcription is unavailable.")


async def _romanize(client: httpx.AsyncClient, key: str, base: str, text: str) -> str:
    """Bangla script → Banglish (how people type in chat). Transcription models keep the script
    when the language is fixed, so this is a tiny rewrite step; on any failure the Bangla text
    is returned unchanged rather than failing the whole transcription."""
    try:
        res = await client.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": get_settings().openai_model or "gpt-4o-mini",
                "temperature": 0,
                "max_completion_tokens": 400,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Rewrite the user's Bangla text in Banglish — Bangla written with Latin letters exactly the way "
                            "Bangladeshi people type in chat (e.g. 'ei mashe amader total sales koto'). Write spoken numbers "
                            "as digits and money as 'BDT 26,350'. Output only the rewritten text, nothing else."
                        ),
                    },
                    {"role": "user", "content": text},
                ],
            },
        )
        if res.status_code >= 400:
            return text
        out = (((res.json().get("choices") or [{}])[0]).get("message") or {}).get("content") or ""
        return out.strip() or text
    except httpx.HTTPError:
        return text


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    language: Optional[str] = Field(default=None, pattern="^(auto|bn|en|banglish)$")
    voice: Optional[str] = None
    speed: float = Field(default=1.0, ge=0.5, le=1.5)


@router.post("/speak")
async def speak(
    payload: SpeakRequest,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    allowed, status = ai_access_allowed()
    if not allowed:
        raise HTTPException(status_code=403, detail=f"AI access is not enabled for this workspace ({status})")
    key, base = _engine(db, user.company_id)
    text = _speech_text(payload.text)
    if not text:
        raise HTTPException(status_code=400, detail="Nothing to read")
    if len(text) > MAX_SPEECH_CHARS:
        text = text[:MAX_SPEECH_CHARS].rsplit(" ", 1)[0] + " …"
    voice = payload.voice if payload.voice in TTS_VOICES else "nova"
    is_bangla = bool(re.search(r"[ঀ-৿]", text)) or payload.language == "bn"
    instructions = (
        "Speak naturally in Bangla (Bangladeshi accent), clearly and at a calm pace; read amounts and numbers "
        "the way a Dhaka finance manager would. Keep product names and codes as written."
        if is_bangla
        else "Speak naturally and clearly, like a helpful business assistant; read amounts and numbers plainly."
    )

    last_error: Optional[HTTPException] = None
    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0)) as client:
        for model in TTS_MODELS:
            body: dict = {"model": model, "input": text, "voice": voice, "response_format": "mp3", "speed": payload.speed}
            if model.startswith("gpt-4o"):
                body["instructions"] = instructions
            try:
                res = await client.post(
                    f"{base}/audio/speech",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json=body,
                )
            except httpx.HTTPError as exc:
                raise HTTPException(status_code=502, detail=f"Aladin voice is unreachable ({exc.__class__.__name__}).") from exc
            if res.status_code == 404 or (res.status_code == 400 and "model" in res.text.lower()):
                last_error = _openai_error(res, "speech")
                continue
            if res.status_code >= 400:
                raise _openai_error(res, "speech")
            return Response(content=res.content, media_type="audio/mpeg", headers={"Cache-Control": "no-store", "X-Aladin-Model": model})
    raise last_error or HTTPException(status_code=502, detail="Aladin speech is unavailable.")
