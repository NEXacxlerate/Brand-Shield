"""Brand Studio AI proxy: chat (Groq, Gemini as fallback) and image generation (Hugging Face router). Keys never leave the server.

What this module guarantees (docs/API.md, "Studio AI"):
* the caller (app/api/studio_ai.py) has already authenticated, rate limited and charged the daily quota;
* every outbound call has a timeout, a bounded number of retries (timeouts, connection errors and 5xx only; 429 and bad keys are not
  retried), and a response size cap (the body is streamed and cut off);
* provider failures become a StudioAIError with a plain message (401/403 -> 503, 402 -> 503, 429 -> 429, 5xx / timeout -> 502);
* prompts, answers and keys are never logged: only provider, status and duration;
* an image from a provider is decoded, size checked and RE-ENCODED as PNG before it is returned.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import urlparse

import httpx
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config.config import Settings
from app.config.time import utcnow
from app.models import ApiUsage

log = logging.getLogger("app.studio_ai")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
HF_ROUTER = "https://router.huggingface.co/"
TEXT_RESPONSE_CAP = 512 * 1024
IMAGE_RESPONSE_CAP = 12 * 1024 * 1024
IMAGE_MAX_SIDE = 4096
IMAGE_MAX_PIXELS = 16_000_000
IMAGE_HOSTS = (".fal.media", ".fal.run", ".huggingface.co", ".hf.co")  # where a provider may tell us to download the finished picture from
ROLES = {"system": "system", "user": "user", "assistant": "assistant", "model": "assistant"}


class StudioAIError(Exception):
    def __init__(self, status_code: int, message: str, retry_after: str | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.retry_after = retry_after


@dataclass
class _Reply:
    status: int
    body: bytes
    headers: httpx.Headers


def _secret(value) -> str | None:
    raw = value.get_secret_value().strip() if value is not None else ""
    return raw if raw and not raw.lower().startswith(("hf_xxx", "your_", "changeme")) else None


def map_status(status: int, retry_after: str | None = None) -> StudioAIError:
    """A provider HTTP status as a safe message for the browser (the provider's own text is never forwarded)."""
    if status in (401, 403):
        return StudioAIError(503, "The AI service is not set up correctly on the server (its key was rejected). Tell the administrator.")
    if status == 402:
        return StudioAIError(503, "The AI service has run out of credits. Tell the administrator.")
    if status == 429:
        return StudioAIError(429, "The AI service is busy right now. Wait a minute and try again.", retry_after)
    if status in (400, 404, 413, 422):
        return StudioAIError(422, "The AI service could not use this request. Try shorter or different text.")
    return StudioAIError(502, "The AI service is not answering right now. Try again in a moment.")


class StudioAI:
    def __init__(
        self, settings: Settings, transport: httpx.BaseTransport | None = None, sleep: Callable[[float], None] = time.sleep
    ) -> None:
        self.s = settings
        self.transport = transport
        self.sleep = sleep

    # ------------------------------------------------------------------ configuration

    @property
    def groq_key(self) -> str | None:
        return _secret(self.s.groq_api_key)

    @property
    def gemini_key(self) -> str | None:
        return _secret(self.s.gemini_api_key)

    @property
    def image_key(self) -> str | None:
        return _secret(self.s.studio_hf_api_key)

    def chat_configured(self) -> bool:
        return bool(self.groq_key or self.gemini_key)

    def image_configured(self) -> bool:
        return bool(self.image_key)

    # ------------------------------------------------------------------ transport

    def _send(self, method: str, url: str, *, headers: dict, json_body: dict | None, timeout: float, cap: int, provider: str) -> _Reply:
        """One request with bounded retries and a response size cap. Raises StudioAIError; never returns a failing status."""
        attempts = 1 + max(0, self.s.studio_ai_max_retries)
        last: StudioAIError | None = None
        for attempt in range(attempts):
            t0 = time.monotonic()
            try:
                with httpx.Client(transport=self.transport, timeout=timeout, follow_redirects=False) as client:
                    with client.stream(method, url, headers=headers, json=json_body) as resp:
                        chunks, size = [], 0
                        for chunk in resp.iter_bytes():
                            size += len(chunk)
                            if size > cap:
                                log.warning("studio ai %s response over the size cap", provider)
                                raise StudioAIError(502, "The AI service sent an answer that is too large.")
                            chunks.append(chunk)
                        reply = _Reply(resp.status_code, b"".join(chunks), resp.headers)
            except StudioAIError:
                raise
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                log.warning("studio ai %s %s after %.1fs (attempt %d)", provider, type(exc).__name__, time.monotonic() - t0, attempt + 1)
                last = StudioAIError(502, "The AI service did not answer in time. Try again in a moment.")
            else:
                log.info("studio ai %s status=%d %.1fs", provider, reply.status, time.monotonic() - t0)
                if reply.status < 400:
                    return reply
                err = map_status(reply.status, reply.headers.get("retry-after"))
                if reply.status < 500:
                    raise err
                last = err
            if attempt + 1 < attempts:
                self.sleep(self.s.studio_ai_retry_backoff_seconds * (attempt + 1))
        assert last is not None
        raise last

    # ------------------------------------------------------------------ chat

    def chat(self, messages: list[dict], *, json_mode: bool, temperature: float, max_tokens: int) -> dict:
        """Groq first, Gemini when Groq has no key or fails. Returns {"text", "provider", "model"}."""
        order = [p for p, key in (("groq", self.groq_key), ("gemini", self.gemini_key)) if key]
        if not order:
            raise StudioAIError(503, "AI chat is not set up on the server (no GROQ_API_KEY or GEMINI_API_KEY).")
        last: StudioAIError | None = None
        for provider in order:
            try:
                text, model = (self._groq if provider == "groq" else self._gemini)(messages, json_mode, temperature, max_tokens)
            except StudioAIError as exc:
                last = exc
                continue
            if json_mode:
                text = _as_json_text(text)
                if text is None:
                    last = StudioAIError(502, "The AI returned an answer that could not be read. Try again.")
                    continue
            return {"text": text, "provider": provider, "model": model}
        assert last is not None
        raise last

    def _groq(self, messages: list[dict], json_mode: bool, temperature: float, max_tokens: int) -> tuple[str, str]:
        body: dict = {
            "model": self.s.studio_groq_model,
            "messages": [{"role": ROLES[m["role"]], "content": m["content"]} for m in messages],
            "temperature": temperature,
            "max_completion_tokens": max_tokens,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        headers = {"Authorization": f"Bearer {self.groq_key}", "Content-Type": "application/json"}
        r = self._send("POST", GROQ_URL, headers=headers, json_body=body, timeout=self.s.studio_ai_timeout_seconds,
                       cap=TEXT_RESPONSE_CAP, provider="groq")
        try:
            text = json.loads(r.body)["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise StudioAIError(502, "The AI returned an answer that could not be read. Try again.") from exc
        if not isinstance(text, str) or not text.strip():
            raise StudioAIError(502, "The AI returned an empty answer. Try again.")
        return text, self.s.studio_groq_model

    def _gemini(self, messages: list[dict], json_mode: bool, temperature: float, max_tokens: int) -> tuple[str, str]:
        model = self.s.gemini_model
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        contents = [
            {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]}
            for m in messages
            if m["role"] != "system"
        ]
        if not contents:  # only a system message: Gemini needs at least one user turn
            contents = [{"role": "user", "parts": [{"text": system}]}]
            system = ""
        cfg: dict = {"temperature": min(temperature, 2.0), "maxOutputTokens": max_tokens}
        if json_mode:
            cfg["responseMimeType"] = "application/json"
        body: dict = {"contents": contents, "generationConfig": cfg}
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        headers = {"x-goog-api-key": self.gemini_key or "", "Content-Type": "application/json"}
        r = self._send("POST", GEMINI_URL.format(model=model), headers=headers, json_body=body, timeout=self.s.studio_ai_timeout_seconds,
                       cap=TEXT_RESPONSE_CAP, provider="gemini")
        try:
            parts = json.loads(r.body)["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise StudioAIError(502, "The AI returned an answer that could not be read. Try again.") from exc
        if not text.strip():
            raise StudioAIError(502, "The AI returned an empty answer. Try again.")
        return text, model

    # ------------------------------------------------------------------ image

    def image(self, prompt: str, width: int, height: int) -> bytes:
        """PNG bytes for `prompt`. The provider's picture is decoded and re-encoded here."""
        key = self.image_key
        if not key:
            raise StudioAIError(503, "Image generation is not set up on the server (no STUDIO_HF_API_KEY).")
        route = self.s.studio_image_route.strip("/")
        body = {"prompt": prompt, "image_size": {"width": width, "height": height}}
        r = self._send("POST", HF_ROUTER + route, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                       json_body=body, timeout=self.s.studio_image_timeout_seconds, cap=IMAGE_RESPONSE_CAP, provider="hf-image")
        raw = self._picture_bytes(r)
        return reencode_png(raw)

    def _picture_bytes(self, r: _Reply) -> bytes:
        if (r.headers.get("content-type") or "").split(";")[0].strip().lower().startswith("image/"):
            return r.body
        try:
            data = json.loads(r.body)
            first = (data.get("images") or data.get("data") or [None])[0]
            ref = first.get("url") if isinstance(first, dict) else first
            if isinstance(first, dict) and not ref and first.get("b64_json"):
                return base64.b64decode(first["b64_json"], validate=False)
        except (ValueError, AttributeError, IndexError, TypeError) as exc:
            raise StudioAIError(502, "The image service returned something that is not a picture.") from exc
        if not isinstance(ref, str):
            raise StudioAIError(502, "The image service returned something that is not a picture.")
        m = re.match(r"data:image/[a-z+.-]+;base64,(.+)$", ref, re.S)
        if m:
            try:
                return base64.b64decode(m.group(1), validate=False)
            except ValueError as exc:
                raise StudioAIError(502, "The image service returned something that is not a picture.") from exc
        u = urlparse(ref)
        host = (u.hostname or "").lower()
        if u.scheme != "https" or not any(host.endswith(h) or host == h.lstrip(".") for h in IMAGE_HOSTS):
            log.warning("studio ai image url host not allowed")
            raise StudioAIError(502, "The image service returned an address that is not trusted.")
        got = self._send("GET", ref, headers={}, json_body=None, timeout=self.s.studio_image_timeout_seconds, cap=IMAGE_RESPONSE_CAP,
                         provider="image-download")
        return got.body


def _as_json_text(text: str) -> str | None:
    """The answer as valid JSON text (this also unwraps a ```json fence or prose). None if there is none."""
    t = text.strip()
    for candidate in (t, re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.I).strip()):
        try:
            json.loads(candidate)
            return candidate
        except ValueError:
            continue
    a, b = t.find("{"), t.rfind("}")
    if 0 <= a < b:
        try:
            json.loads(t[a : b + 1])
            return t[a : b + 1]
        except ValueError:
            return None
    return None


def reencode_png(raw: bytes) -> bytes:
    """Decode (with size and pixel caps), then write a fresh PNG: metadata and any trailing bytes are dropped."""
    if not raw:
        raise StudioAIError(502, "The image service returned an empty picture.")
    Image.MAX_IMAGE_PIXELS = IMAGE_MAX_PIXELS
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(raw)) as img:
            img.load()
            w, h = img.size
            if w < 16 or h < 16 or w > IMAGE_MAX_SIDE or h > IMAGE_MAX_SIDE:
                raise StudioAIError(502, "The image service returned a picture of an unexpected size.")
            out = io.BytesIO()
            (img if img.mode in ("RGB", "RGBA", "L") else img.convert("RGBA")).save(out, format="PNG")
    except StudioAIError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError) as exc:
        raise StudioAIError(502, "The image service returned something that is not a picture.") from exc
    return out.getvalue()


# ------------------------------------------------- daily quota (kept in api_usage, so it survives restarts and serverless)


def _usage_key(kind: str, user_id: int, now: datetime) -> tuple[str, str]:
    return f"studio:{kind}:u{user_id}:{now:%Y%m%d}", f"{now:%Y-%m}"


def reserve_quota(db: Session, user_id: int, kind: str, limit: int, now: datetime | None = None) -> bool:
    """Take one unit of today's quota. False when the user is at the limit. `limit` 0 or less = unlimited."""
    if limit <= 0:
        return True
    provider, month = _usage_key(kind, user_id, now or utcnow())
    if db.scalar(select(ApiUsage.id).where(ApiUsage.provider == provider, ApiUsage.month == month)) is None:
        try:
            db.add(ApiUsage(provider=provider, month=month, credits=0))
            db.commit()
        except IntegrityError:
            db.rollback()
    res = db.execute(
        update(ApiUsage).where(ApiUsage.provider == provider, ApiUsage.month == month, ApiUsage.credits + 1 <= limit)
        .values(credits=ApiUsage.credits + 1, updated_at=utcnow())
    )
    db.commit()
    return bool(res.rowcount)  # type: ignore[attr-defined]


def refund_quota(db: Session, user_id: int, kind: str, limit: int, now: datetime | None = None) -> None:
    """The provider call failed: give the unit back so a broken provider does not use up the user's day."""
    if limit <= 0:
        return
    provider, month = _usage_key(kind, user_id, now or utcnow())
    db.execute(update(ApiUsage).where(ApiUsage.provider == provider, ApiUsage.month == month, ApiUsage.credits >= 1)
               .values(credits=ApiUsage.credits - 1, updated_at=utcnow()))
    db.commit()


def used_today(db: Session, user_id: int, kind: str, now: datetime | None = None) -> int:
    provider, month = _usage_key(kind, user_id, now or utcnow())
    return db.scalar(select(ApiUsage.credits).where(ApiUsage.provider == provider, ApiUsage.month == month)) or 0
