"""Brand Studio AI proxy. Signed-in users only; the provider keys never leave the server (app/services/studio_ai.py).

POST /api/studio/ai/chat   {messages, response_format: json|text, temperature, max_tokens}  ->  {text, provider, model}
POST /api/studio/ai/image  {prompt, size}  ->  {image_base64, data_url, media_type, width, height, provider, model}   (?format=png returns the bytes)
GET  /api/studio/ai/status  what is configured and today's usage (no secrets)
"""

from __future__ import annotations

import base64
import io
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.config.config import Settings
from app.config.deps import get_current_user, get_settings_dep
from app.db.session import get_db
from app.models import User
from app.services import studio_ai as svc

router = APIRouter(prefix="/studio/ai")

MESSAGE_CHARS_MAX = 12000
IMAGE_SIZES = {"512x512", "768x768", "1024x1024", "1024x768", "768x1024", "1280x720", "720x1280"}


class AiMessage(BaseModel):
    role: Literal["system", "user", "assistant", "model"]
    content: str | None = Field(default=None, max_length=MESSAGE_CHARS_MAX)
    text: str | None = Field(default=None, max_length=MESSAGE_CHARS_MAX)  # the Studio's ChatMessage uses `text`

    @model_validator(mode="after")
    def _one(self) -> AiMessage:
        value = self.content if self.content is not None else self.text
        if value is None or not value.strip():
            raise ValueError("Each message needs non-empty content")
        self.content, self.text = value, None
        return self


class ChatBody(BaseModel):
    messages: list[AiMessage] = Field(min_length=1, max_length=200)
    response_format: Literal["json", "text"] = "text"
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1)


class ImageBody(BaseModel):
    prompt: str = Field(min_length=1, max_length=20000)
    size: str = "1024x1024"


def _ai(request: Request) -> svc.StudioAI:
    return request.app.state.studio_ai


def _guard(request: Request, db: Session, user: User, settings: Settings, kind: str, limit: int) -> None:
    """Per-user rate limit, then the daily quota. Raises HTTPException."""
    if not request.app.state.studio_ai_limiter.allow(f"user:{user.id}"):
        raise HTTPException(429, "Too many AI requests. Wait a moment and try again.", headers={"Retry-After": "30"})
    if not svc.reserve_quota(db, user.id, kind, limit):
        raise HTTPException(429, f"You have used today's {'image' if kind == 'image' else 'text'} AI allowance ({limit}). It resets at midnight UTC.")


def _fail(exc: svc.StudioAIError) -> HTTPException:
    return HTTPException(exc.status_code, exc.message, headers={"Retry-After": exc.retry_after} if exc.retry_after else None)


@router.get("/status")
def ai_status(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db), settings: Settings = Depends(get_settings_dep)) -> dict:
    ai = _ai(request)
    return {
        "chat": {"configured": ai.chat_configured(), "providers": [p for p, ok in (("groq", ai.groq_key), ("gemini", ai.gemini_key)) if ok],
                 "used_today": svc.used_today(db, user.id, "text"), "daily_limit": settings.studio_daily_text_quota},
        "image": {"configured": ai.image_configured(), "used_today": svc.used_today(db, user.id, "image"), "daily_limit": settings.studio_daily_image_quota,
                  "sizes": sorted(IMAGE_SIZES)},
        "limits": {"requests_per_minute": settings.studio_ai_rate_per_minute, "max_messages": settings.studio_max_messages,
                   "max_chars": settings.studio_max_chars, "max_tokens": settings.studio_max_tokens, "max_prompt_chars": settings.studio_max_prompt_chars},
    }


@router.post("/chat")
def chat(body: ChatBody, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db),
         settings: Settings = Depends(get_settings_dep)) -> dict:
    if len(body.messages) > settings.studio_max_messages:
        raise HTTPException(422, f"At most {settings.studio_max_messages} messages per request")
    messages = [{"role": m.role, "content": m.content or ""} for m in body.messages]
    if sum(len(m["content"]) for m in messages) > settings.studio_max_chars:
        raise HTTPException(413, f"The messages are longer than {settings.studio_max_chars} characters in total")
    if body.max_tokens is not None and body.max_tokens > settings.studio_max_tokens:
        raise HTTPException(422, f"max_tokens must be at most {settings.studio_max_tokens}")
    ai = _ai(request)
    if not ai.chat_configured():
        raise HTTPException(503, "AI chat is not set up on the server.")
    _guard(request, db, user, settings, "text", settings.studio_daily_text_quota)
    try:
        return ai.chat(messages, json_mode=body.response_format == "json", temperature=body.temperature, max_tokens=body.max_tokens or settings.studio_max_tokens)
    except svc.StudioAIError as exc:
        svc.refund_quota(db, user.id, "text", settings.studio_daily_text_quota)
        raise _fail(exc) from exc


@router.post("/image")
def image(body: ImageBody, request: Request, format: Literal["json", "png"] = "json", user: User = Depends(get_current_user),
          db: Session = Depends(get_db), settings: Settings = Depends(get_settings_dep)):
    prompt = " ".join(body.prompt.split())
    if not prompt:
        raise HTTPException(422, "Describe the image to generate")
    if len(prompt) > settings.studio_max_prompt_chars:
        raise HTTPException(413, f"The prompt is longer than {settings.studio_max_prompt_chars} characters")
    size = body.size.strip().lower().replace(" ", "")
    if size not in IMAGE_SIZES or not re.fullmatch(r"\d+x\d+", size):
        raise HTTPException(422, f"size must be one of: {', '.join(sorted(IMAGE_SIZES))}")
    width, height = (int(x) for x in size.split("x"))
    ai = _ai(request)
    if not ai.image_configured():
        raise HTTPException(503, "Image generation is not set up on the server.")
    _guard(request, db, user, settings, "image", settings.studio_daily_image_quota)
    try:
        png = ai.image(prompt, width, height)
    except svc.StudioAIError as exc:
        svc.refund_quota(db, user.id, "image", settings.studio_daily_image_quota)
        raise _fail(exc) from exc
    with Image.open(io.BytesIO(png)) as shown:
        width, height = shown.size  # what the provider really returned
    if format == "png":
        return Response(png, media_type="image/png", headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"})
    b64 = base64.b64encode(png).decode()
    return {"image_base64": b64, "data_url": f"data:image/png;base64,{b64}", "media_type": "image/png", "width": width, "height": height,
            "provider": "huggingface", "model": settings.studio_image_model}
