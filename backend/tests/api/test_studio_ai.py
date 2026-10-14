"""Brand Studio AI proxy: auth, caps, rate limit, daily quota, fallbacks, error mapping, image re-encoding. Every provider call is mocked."""

from __future__ import annotations

import base64
import io
import json
from contextlib import contextmanager

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import SecretStr

from app.db.base import Base
from app.db.session import make_engine
from app.main import create_app
from app.services.studio_ai import StudioAI, reencode_png
from tests.conftest import ADMIN, FakeChecker, headers_for
from tests.scan_helpers import png_bytes

GROQ = "api.groq.com"
GEMINI = "generativelanguage.googleapis.com"
HF = "router.huggingface.co"
KEY_GROQ, KEY_GEMINI, KEY_HF = "gsk_test_key_123", "gem_test_key_456", "hf_test_key_789"


def groq_ok(text='{"names": []}'):
    return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": text}}]})


def gemini_ok(text="hello from gemini"):
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})


def fal_ok(png: bytes | None = None, url="https://v3.fal.media/files/abc/out.png"):
    return httpx.Response(200, json={"images": [{"url": url}]})


class Wire:
    """Records every outbound request and answers by host through per-host handlers."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.handlers: dict[str, object] = {}
        self.png = png_bytes((20, 120, 220), size=64)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        h = self.handlers.get(request.url.host)
        if h is None and request.url.host.endswith("fal.media"):
            return httpx.Response(200, content=self.png, headers={"content-type": "image/png"})
        assert h is not None, f"unexpected host {request.url.host}"
        return h(request) if callable(h) else h

    def to(self, host: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.url.host == host]


@contextmanager
def studio_client(settings, wire: Wire, **updates):
    base = {"groq_api_key": SecretStr(KEY_GROQ), "gemini_api_key": SecretStr(KEY_GEMINI), "studio_hf_api_key": SecretStr(KEY_HF),
            "studio_ai_retry_backoff_seconds": 0.0}
    s = settings.model_copy(update={**base, **updates})
    engine = make_engine("sqlite://")
    Base.metadata.create_all(engine)
    app = create_app(s, engine=engine, url_checker=FakeChecker())  # type: ignore[arg-type]
    app.state.studio_ai = StudioAI(s, transport=httpx.MockTransport(wire), sleep=lambda _s: None)
    with TestClient(app) as c:
        r = c.post("/api/auth/register", json={"name": "Ai User", "email": "ai@example.com", "password": "Correct-Horse-9"})
        c.h = {"Authorization": f"Bearer {r.json()['access_token']}"}  # type: ignore[attr-defined]
        c.app_ref = app  # type: ignore[attr-defined]
        yield c


@pytest.fixture
def wire() -> Wire:
    return Wire()


def chat(c, **body):
    return c.post("/api/studio/ai/chat", json={"messages": [{"role": "user", "content": "hi"}], **body}, headers=c.h)


# ---------------------------------------------------------------- auth and shape


def test_auth_required(settings, wire):
    with studio_client(settings, wire) as c:
        assert c.post("/api/studio/ai/chat", json={"messages": [{"role": "user", "content": "x"}]}).status_code == 401
        assert c.post("/api/studio/ai/image", json={"prompt": "x"}).status_code == 401
        assert c.get("/api/studio/ai/status").status_code == 401
    assert wire.requests == []


def test_chat_groq_json_mode_request_and_response(settings, wire):
    wire.handlers[GROQ] = groq_ok('{"names": [{"name": "Nova", "explanation": "x"}]}')
    with studio_client(settings, wire) as c:
        msgs = [{"role": "system", "content": "You are a strategist."}, {"role": "user", "content": "10 names"}]
        r = c.post("/api/studio/ai/chat", json={"messages": msgs, "response_format": "json", "temperature": 0.8, "max_tokens": 1000}, headers=c.h)
    assert r.status_code == 200, r.text
    assert r.json() == {"text": '{"names": [{"name": "Nova", "explanation": "x"}]}', "provider": "groq", "model": "openai/gpt-oss-120b"}
    sent = wire.to(GROQ)[0]
    body = json.loads(sent.content)
    assert body["model"] == "openai/gpt-oss-120b" and body["temperature"] == 0.8 and body["max_completion_tokens"] == 1000
    assert body["response_format"] == {"type": "json_object"} and [m["role"] for m in body["messages"]] == ["system", "user"]
    assert sent.headers["authorization"] == f"Bearer {KEY_GROQ}"


def test_chat_accepts_the_studios_text_field_and_model_role(settings, wire):
    wire.handlers[GROQ] = groq_ok("sure")
    with studio_client(settings, wire) as c:
        r = c.post("/api/studio/ai/chat", json={"messages": [{"role": "user", "text": "hello"}, {"role": "model", "text": "hi"},
                                                              {"role": "user", "text": "again"}]}, headers=c.h)
    assert r.status_code == 200 and r.json()["text"] == "sure"
    sent = json.loads(wire.to(GROQ)[0].content)
    assert [(m["role"], m["content"]) for m in sent["messages"]] == [("user", "hello"), ("assistant", "hi"), ("user", "again")]
    assert "response_format" not in sent


def test_json_mode_unwraps_a_fenced_answer_and_rejects_garbage(settings, wire):
    wire.handlers[GROQ] = groq_ok('```json\n{"a": 1}\n```')
    with studio_client(settings, wire) as c:
        r = chat(c, response_format="json")
        assert r.status_code == 200 and json.loads(r.json()["text"]) == {"a": 1}
        wire.handlers[GROQ] = groq_ok("this is not json at all")
        wire.handlers[GEMINI] = gemini_ok("neither is this")
        bad = chat(c, response_format="json")
        assert bad.status_code == 502 and "could not be read" in bad.json()["detail"]


# ---------------------------------------------------------------- caps


def test_request_caps(settings, wire):
    wire.handlers[GROQ] = groq_ok("ok")
    with studio_client(settings, wire, studio_max_messages=3, studio_max_chars=100, studio_max_tokens=500) as c:
        too_many = c.post("/api/studio/ai/chat", json={"messages": [{"role": "user", "content": "x"}] * 4}, headers=c.h)
        assert too_many.status_code == 422
        long = c.post("/api/studio/ai/chat", json={"messages": [{"role": "user", "content": "x" * 60}, {"role": "user", "content": "y" * 60}]}, headers=c.h)
        assert long.status_code == 413
        assert chat(c, max_tokens=501).status_code == 422
        assert chat(c, max_tokens=500).status_code == 200
        assert chat(c, temperature=3).status_code == 422
        assert chat(c, response_format="xml").status_code == 422
        assert c.post("/api/studio/ai/chat", json={"messages": []}, headers=c.h).status_code == 422
        assert c.post("/api/studio/ai/chat", json={"messages": [{"role": "user", "content": "  "}]}, headers=c.h).status_code == 422
        assert c.post("/api/studio/ai/chat", json={"messages": [{"role": "tool", "content": "x"}]}, headers=c.h).status_code == 422
        assert c.post("/api/studio/ai/chat", json={"messages": [{"role": "user", "content": "x" * 13000}]}, headers=c.h).status_code == 422
    assert len(wire.to(GROQ)) == 1  # nothing rejected above reached the provider


def test_default_max_tokens_is_the_cap(settings, wire):
    wire.handlers[GROQ] = groq_ok("ok")
    with studio_client(settings, wire) as c:
        chat(c)
    assert json.loads(wire.to(GROQ)[0].content)["max_completion_tokens"] == settings.studio_max_tokens == 4096


def test_image_prompt_and_size_caps(settings, wire):
    wire.handlers[HF] = fal_ok()
    with studio_client(settings, wire, studio_max_prompt_chars=50) as c:
        assert c.post("/api/studio/ai/image", json={"prompt": "x" * 51}, headers=c.h).status_code == 413
        assert c.post("/api/studio/ai/image", json={"prompt": "   "}, headers=c.h).status_code == 422
        assert c.post("/api/studio/ai/image", json={"prompt": "logo", "size": "9999x9999"}, headers=c.h).status_code == 422
        assert c.post("/api/studio/ai/image", json={"prompt": "logo", "size": "abc"}, headers=c.h).status_code == 422
        assert c.post("/api/studio/ai/image", json={"prompt": "x" * 20001}, headers=c.h).status_code == 422
    assert wire.requests == []


# ---------------------------------------------------------------- rate limit and quota


def test_rate_limit_per_user(settings, wire):
    wire.handlers[GROQ] = groq_ok("ok")
    with studio_client(settings, wire, studio_ai_rate_per_minute=3) as c:
        assert [chat(c).status_code for _ in range(5)] == [200, 200, 200, 429, 429]
        # another user is not affected by this one's limit
        r2 = c.post("/api/auth/register", json={"name": "Second", "email": "second@example.com", "password": "Correct-Horse-9"})
        h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}
        assert c.post("/api/studio/ai/chat", json={"messages": [{"role": "user", "content": "x"}]}, headers=h2).status_code == 200
    assert len(wire.to(GROQ)) == 4


def test_daily_quota_text_and_image_are_separate_and_per_user(settings, wire):
    wire.handlers[GROQ] = groq_ok("ok")
    wire.handlers[HF] = fal_ok()
    with studio_client(settings, wire, studio_daily_text_quota=2, studio_daily_image_quota=1, studio_ai_rate_per_minute=100) as c:
        assert [chat(c).status_code for _ in range(3)] == [200, 200, 429]
        assert "allowance" in chat(c).json()["detail"]
        assert c.post("/api/studio/ai/image", json={"prompt": "a logo"}, headers=c.h).status_code == 200
        assert c.post("/api/studio/ai/image", json={"prompt": "a logo"}, headers=c.h).status_code == 429
        status = c.get("/api/studio/ai/status", headers=c.h).json()
        assert status["chat"]["used_today"] == 2 and status["chat"]["daily_limit"] == 2 and status["image"]["used_today"] == 1
        r2 = c.post("/api/auth/register", json={"name": "Second", "email": "second@example.com", "password": "Correct-Horse-9"})
        h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}
        assert c.post("/api/studio/ai/chat", json={"messages": [{"role": "user", "content": "x"}]}, headers=h2).status_code == 200


def test_failed_provider_calls_do_not_use_up_the_quota(settings, wire):
    wire.handlers[GROQ] = httpx.Response(500)
    wire.handlers[GEMINI] = httpx.Response(500)
    with studio_client(settings, wire, studio_daily_text_quota=2, studio_ai_rate_per_minute=100) as c:
        assert [chat(c).status_code for _ in range(4)] == [502] * 4
        assert c.get("/api/studio/ai/status", headers=c.h).json()["chat"]["used_today"] == 0
        wire.handlers[GROQ] = groq_ok("fine")
        assert chat(c).status_code == 200


def test_quota_zero_means_unlimited(settings, wire):
    wire.handlers[GROQ] = groq_ok("ok")
    with studio_client(settings, wire, studio_daily_text_quota=0, studio_ai_rate_per_minute=100) as c:
        assert all(chat(c).status_code == 200 for _ in range(5))


# ---------------------------------------------------------------- missing keys and fallbacks


def test_no_keys_is_a_plain_503(settings, wire):
    with studio_client(settings, wire, groq_api_key=None, gemini_api_key=None, studio_hf_api_key=None) as c:
        r = chat(c)
        assert r.status_code == 503 and "not set up" in r.json()["detail"]
        i = c.post("/api/studio/ai/image", json={"prompt": "a logo"}, headers=c.h)
        assert i.status_code == 503 and "not set up" in i.json()["detail"]
        st = c.get("/api/studio/ai/status", headers=c.h).json()
        assert st["chat"] == {"configured": False, "providers": [], "used_today": 0, "daily_limit": 200}
        assert st["image"]["configured"] is False
    assert wire.requests == []


def test_placeholder_keys_count_as_missing(settings, wire):
    with studio_client(settings, wire, groq_api_key=SecretStr("your_groq_key"), gemini_api_key=None, studio_hf_api_key=SecretStr("hf_xxx_replace")) as c:
        assert chat(c).status_code == 503
        assert c.post("/api/studio/ai/image", json={"prompt": "a logo"}, headers=c.h).status_code == 503


def test_gemini_is_used_when_groq_has_no_key(settings, wire):
    wire.handlers[GEMINI] = gemini_ok('{"ok": true}')
    with studio_client(settings, wire, groq_api_key=None) as c:
        msgs = [{"role": "system", "content": "Be brief."}, {"role": "user", "content": "q1"}, {"role": "model", "content": "a1"}, {"role": "user", "content": "q2"}]
        r = c.post("/api/studio/ai/chat", json={"messages": msgs, "response_format": "json", "temperature": 0.5}, headers=c.h)
    assert r.status_code == 200 and r.json()["provider"] == "gemini" and r.json()["model"] == settings.gemini_model
    assert wire.to(GROQ) == []
    sent = wire.to(GEMINI)[0]
    body = json.loads(sent.content)
    assert sent.headers["x-goog-api-key"] == KEY_GEMINI and f"models/{settings.gemini_model}:generateContent" in sent.url.path
    assert body["systemInstruction"] == {"parts": [{"text": "Be brief."}]}
    assert [c_["role"] for c_ in body["contents"]] == ["user", "model", "user"]
    assert body["generationConfig"]["responseMimeType"] == "application/json" and body["generationConfig"]["temperature"] == 0.5


@pytest.mark.parametrize("groq_status", [401, 402, 429, 500, 503])
def test_gemini_is_the_fallback_when_groq_fails(settings, wire, groq_status):
    wire.handlers[GROQ] = httpx.Response(groq_status)
    wire.handlers[GEMINI] = gemini_ok("from the fallback")
    with studio_client(settings, wire) as c:
        r = chat(c)
    assert r.status_code == 200 and r.json() == {"text": "from the fallback", "provider": "gemini", "model": settings.gemini_model}


def test_groq_timeout_falls_back_to_gemini(settings, wire):
    def boom(request):
        raise httpx.ReadTimeout("slow", request=request)

    wire.handlers[GROQ] = boom
    wire.handlers[GEMINI] = gemini_ok("late but fine")
    with studio_client(settings, wire) as c:
        r = chat(c)
    assert r.status_code == 200 and r.json()["provider"] == "gemini"
    assert len(wire.to(GROQ)) == 3  # first try + 2 retries, then the fallback


# ---------------------------------------------------------------- provider errors are mapped, never forwarded


@pytest.mark.parametrize(("status", "expected", "words"), [
    (401, 503, "key was rejected"), (403, 503, "key was rejected"), (402, 503, "run out of credits"), (429, 429, "busy"),
    (500, 502, "not answering"), (502, 502, "not answering"), (400, 422, "could not use"),
])
def test_provider_errors_are_mapped(settings, wire, status, expected, words):
    secret_text = "PROVIDER-SECRET-DETAIL sk-leak"
    wire.handlers[GROQ] = httpx.Response(status, text=secret_text, headers={"retry-after": "7"})
    with studio_client(settings, wire, gemini_api_key=None) as c:
        r = chat(c)
    assert r.status_code == expected and words in r.json()["detail"]
    assert secret_text not in r.text and KEY_GROQ not in r.text
    if status == 429:
        assert r.headers.get("retry-after") == "7"


def test_5xx_is_retried_a_bounded_number_of_times_and_then_succeeds(settings, wire):
    calls = {"n": 0}

    def flaky(request):
        calls["n"] += 1
        return httpx.Response(503) if calls["n"] < 3 else groq_ok("third time lucky")

    wire.handlers[GROQ] = flaky
    with studio_client(settings, wire) as c:
        r = chat(c)
    assert r.status_code == 200 and r.json()["text"] == "third time lucky" and calls["n"] == 3


def test_429_and_bad_keys_are_not_retried(settings, wire):
    for status in (429, 401, 402):
        wire.requests.clear()
        wire.handlers[GROQ] = httpx.Response(status)
        with studio_client(settings, wire, gemini_api_key=None) as c:
            chat(c)
        assert len(wire.to(GROQ)) == 1, status


def test_retries_are_bounded_by_config(settings, wire):
    wire.handlers[GROQ] = httpx.Response(500)
    with studio_client(settings, wire, gemini_api_key=None, studio_ai_max_retries=0) as c:
        assert chat(c).status_code == 502
    assert len(wire.to(GROQ)) == 1


def test_oversized_provider_answers_are_cut_off(settings, wire):
    wire.handlers[GROQ] = httpx.Response(200, content=b"x" * (600 * 1024))
    with studio_client(settings, wire, gemini_api_key=None) as c:
        r = chat(c)
    assert r.status_code == 502 and "too large" in r.json()["detail"]


def test_empty_or_odd_provider_bodies_are_clean_errors(settings, wire):
    with studio_client(settings, wire, gemini_api_key=None) as c:
        for resp in (groq_ok(""), httpx.Response(200, json={"choices": []}), httpx.Response(200, text="<html>"), httpx.Response(200, json={})):
            wire.handlers[GROQ] = resp
            assert chat(c).status_code == 502


def test_prompts_and_keys_are_never_logged(settings, wire, caplog):
    wire.handlers[GROQ] = httpx.Response(500, text="boom")
    wire.handlers[GEMINI] = httpx.Response(500)
    with caplog.at_level("DEBUG"), studio_client(settings, wire) as c:
        c.post("/api/studio/ai/chat", json={"messages": [{"role": "user", "content": "SUPER-SECRET-PROMPT-TEXT"}]}, headers=c.h)
    text = caplog.text
    assert "SUPER-SECRET-PROMPT-TEXT" not in text
    for key in (KEY_GROQ, KEY_GEMINI, KEY_HF):
        assert key not in text


# ---------------------------------------------------------------- images


def test_image_json_response_is_a_re_encoded_png(settings, wire):
    wire.handlers[HF] = fal_ok()
    wire.png = png_bytes((20, 120, 220), size=64) + b"TRAILING-GARBAGE"  # an appended payload must not survive
    with studio_client(settings, wire) as c:
        r = c.post("/api/studio/ai/image", json={"prompt": "  a   minimal logo ", "size": "512x512"}, headers=c.h)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["media_type"] == "image/png" and (j["width"], j["height"]) == (64, 64) and j["model"] == "Qwen/Qwen-Image"
    png = base64.b64decode(j["image_base64"])
    assert png[:8] == b"\x89PNG\r\n\x1a\n" and b"TRAILING-GARBAGE" not in png
    assert j["data_url"] == "data:image/png;base64," + j["image_base64"]
    sent = wire.to(HF)[0]
    assert sent.url.path == "/fal-ai/fal-ai/qwen-image" and sent.headers["authorization"] == f"Bearer {KEY_HF}"
    assert json.loads(sent.content) == {"prompt": "a minimal logo", "image_size": {"width": 512, "height": 512}}
    assert len(wire.to("v3.fal.media")) == 1


def test_image_can_come_back_as_raw_png_bytes(settings, wire):
    wire.handlers[HF] = lambda request: httpx.Response(200, content=wire.png, headers={"content-type": "image/png"})
    with studio_client(settings, wire) as c:
        r = c.post("/api/studio/ai/image?format=png", json={"prompt": "logo"}, headers=c.h)
    assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert Image.open(io.BytesIO(r.content)).size == (64, 64)


def test_image_returned_as_a_data_url_or_base64(settings, wire):
    b64 = base64.b64encode(wire.png).decode()
    with studio_client(settings, wire) as c:
        wire.handlers[HF] = httpx.Response(200, json={"images": [{"url": "data:image/png;base64," + b64}]})
        assert c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h).status_code == 200
        wire.handlers[HF] = httpx.Response(200, json={"data": [{"b64_json": b64}]})
        assert c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h).status_code == 200


def test_untrusted_image_hosts_and_schemes_are_refused(settings, wire):
    with studio_client(settings, wire) as c:
        for url in ("https://evil.example/x.png", "http://v3.fal.media/x.png", "https://169.254.169.254/latest", "https://fal.media.evil.example/x.png",
                    "file:///etc/passwd"):
            wire.handlers[HF] = httpx.Response(200, json={"images": [{"url": url}]})
            r = c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h)
            assert r.status_code == 502 and "not trusted" in r.json()["detail"], url
    assert all(rq.url.host in (HF,) for rq in wire.requests)  # nothing was fetched from the refused addresses


def test_non_image_and_hostile_pictures_are_refused(settings, wire):
    with studio_client(settings, wire) as c:
        for content in (b"<svg onload=alert(1)/>", b"not a picture", b"\x89PNG\r\n\x1a\n" + b"x" * 50, b""):
            wire.handlers[HF] = httpx.Response(200, content=content, headers={"content-type": "image/png"})
            assert c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h).status_code == 502


def test_image_error_mapping_and_quota_refund(settings, wire):
    with studio_client(settings, wire, studio_daily_image_quota=1) as c:
        wire.handlers[HF] = httpx.Response(402, text="You have no remaining credits PRIVATE")
        r = c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h)
        assert r.status_code == 503 and "run out of credits" in r.json()["detail"] and "PRIVATE" not in r.text
        assert c.get("/api/studio/ai/status", headers=c.h).json()["image"]["used_today"] == 0
        wire.handlers[HF] = httpx.Response(429)
        assert c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h).status_code == 429
        wire.handlers[HF] = fal_ok()
        assert c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h).status_code == 200


def test_reencode_png_limits():
    ok = reencode_png(png_bytes(size=64))
    assert ok[:8] == b"\x89PNG\r\n\x1a\n"
    from app.services.studio_ai import StudioAIError

    tiny = io.BytesIO()
    Image.new("RGB", (8, 8)).save(tiny, format="PNG")
    with pytest.raises(StudioAIError):
        reencode_png(tiny.getvalue())
    jpg = io.BytesIO()
    Image.new("RGB", (64, 64), (1, 2, 3)).save(jpg, format="JPEG")
    assert reencode_png(jpg.getvalue())[:4] == b"\x89PNG"  # any picture format in, PNG out


def test_status_endpoint_has_no_secrets(settings, wire):
    with studio_client(settings, wire) as c:
        text = c.get("/api/studio/ai/status", headers=c.h).text
    for key in (KEY_GROQ, KEY_GEMINI, KEY_HF):
        assert key not in text
    assert json.loads(text)["chat"]["providers"] == ["groq", "gemini"]


def test_admin_login_still_works_with_the_proxy_installed(settings, wire):
    with studio_client(settings, wire) as c:
        assert headers_for(c, *ADMIN)
