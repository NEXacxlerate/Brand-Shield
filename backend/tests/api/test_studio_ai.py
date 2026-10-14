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
POLL = "gen.pollinations.ai"
KEY_GROQ, KEY_GEMINI, KEY_POLL = "gsk_test_key_123", "gem_test_key_456", "sk_poll_test_789"


def groq_ok(text='{"names": []}'):
    return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": text}}]})


def gemini_ok(text="hello from gemini"):
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})


def poll_ok():
    return lambda request: httpx.Response(200, content=png_bytes((20, 120, 220), size=64), headers={"content-type": "image/png"})


class Wire:
    """Records every outbound request and answers by host through per-host handlers."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.handlers: dict[str, object] = {}
        self.png = png_bytes((20, 120, 220), size=64)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        h = self.handlers.get(request.url.host)
        assert h is not None, f"unexpected host {request.url.host}"
        return h(request) if callable(h) else h

    def to(self, host: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.url.host == host]


@contextmanager
def studio_client(settings, wire: Wire, **updates):
    base = {"groq_api_key": SecretStr(KEY_GROQ), "gemini_api_key": SecretStr(KEY_GEMINI), "pollinations_api_key": SecretStr(KEY_POLL),
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
    wire.handlers[POLL] = poll_ok()
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
    wire.handlers[POLL] = poll_ok()
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
    with studio_client(settings, wire, groq_api_key=None, gemini_api_key=None, pollinations_api_key=None) as c:
        r = chat(c)
        assert r.status_code == 503 and "not set up" in r.json()["detail"]
        i = c.post("/api/studio/ai/image", json={"prompt": "a logo"}, headers=c.h)
        assert i.status_code == 503 and "not set up" in i.json()["detail"]
        st = c.get("/api/studio/ai/status", headers=c.h).json()
        assert st["chat"] == {"configured": False, "providers": [], "used_today": 0, "daily_limit": 200}
        assert st["image"]["configured"] is False
    assert wire.requests == []


def test_placeholder_keys_count_as_missing(settings, wire):
    with studio_client(settings, wire, groq_api_key=SecretStr("your_groq_key"), gemini_api_key=None, pollinations_api_key=SecretStr("your_pollinations_key")) as c:
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
    for key in (KEY_GROQ, KEY_GEMINI, KEY_POLL):
        assert key not in text


# ---------------------------------------------------------------- images


def test_image_json_response_is_a_re_encoded_png(settings, wire, caplog):
    caplog.set_level("DEBUG")
    wire.png = png_bytes((20, 120, 220), size=64) + b"TRAILING-GARBAGE"  # an appended payload must not survive
    wire.handlers[POLL] = lambda request: httpx.Response(200, content=wire.png, headers={"content-type": "image/png"})
    with studio_client(settings, wire) as c:
        r = c.post("/api/studio/ai/image", json={"prompt": "  a   minimal logo ", "size": "512x512"}, headers=c.h)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["media_type"] == "image/png" and (j["width"], j["height"]) == (64, 64) and j["provider"] == "pollinations"
    assert j["model"] == "black-forest-labs/flux.1-schnell"
    png = base64.b64decode(j["image_base64"])
    assert png[:8] == b"\x89PNG\r\n\x1a\n" and b"TRAILING-GARBAGE" not in png
    assert j["data_url"] == "data:image/png;base64," + j["image_base64"]
    sent = wire.to(POLL)[0]
    assert sent.method == "GET" and sent.url.raw_path.decode().startswith("/image/a%20minimal%20logo?") and sent.headers["authorization"] == f"Bearer {KEY_POLL}"
    assert dict(sent.url.params) == {"model": "black-forest-labs/flux.1-schnell", "width": "512", "height": "512", "seed": "-1"}
    assert KEY_POLL not in str(sent.url)
    assert "minimal" not in caplog.text and KEY_POLL not in caplog.text  # neither the prompt (it is in the URL) nor the key is logged


def test_image_prompt_is_url_encoded_not_injected(settings, wire):
    wire.handlers[POLL] = poll_ok()
    with studio_client(settings, wire) as c:
        assert c.post("/api/studio/ai/image", json={"prompt": "a/b?c=d&key=evil #x"}, headers=c.h).status_code == 200
    sent = wire.to(POLL)[0]
    assert "key" not in dict(sent.url.params) and set(dict(sent.url.params)) == {"model", "width", "height", "seed"}
    assert "%2F" in sent.url.raw_path.decode() and "%3F" in sent.url.raw_path.decode()


def test_image_can_come_back_as_raw_png_bytes(settings, wire):
    wire.handlers[POLL] = poll_ok()
    with studio_client(settings, wire) as c:
        r = c.post("/api/studio/ai/image?format=png", json={"prompt": "logo"}, headers=c.h)
    assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert Image.open(io.BytesIO(r.content)).size == (64, 64)


def test_jpeg_from_the_provider_is_re_encoded_as_png(settings, wire):
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (200, 30, 30)).save(buf, format="JPEG")
    wire.handlers[POLL] = httpx.Response(200, content=buf.getvalue(), headers={"content-type": "image/jpeg"})
    with studio_client(settings, wire) as c:
        r = c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h)
    assert r.status_code == 200 and r.json()["media_type"] == "image/png" and (r.json()["width"], r.json()["height"]) == (64, 48)
    assert base64.b64decode(r.json()["image_base64"])[:8] == b"\x89PNG\r\n\x1a\n"


def test_non_image_and_hostile_pictures_are_refused(settings, wire):
    with studio_client(settings, wire) as c:
        for content, ctype in ((b"<svg onload=alert(1)/>", "image/svg+xml"), (b"not a picture", "image/png"), (b"\x89PNG\r\n\x1a\n" + b"x" * 50, "image/png"),
                               (b"", "image/png"), (b'{"url": "https://evil.example/x.png"}', "application/json"), (b"<html></html>", "text/html")):
            wire.handlers[POLL] = httpx.Response(200, content=content, headers={"content-type": ctype})
            assert c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h).status_code == 502
    assert all(rq.url.host == POLL for rq in wire.requests)  # nothing else is ever fetched


def test_oversized_picture_is_refused(settings, wire):
    big = io.BytesIO()
    Image.new("RGB", (5000, 20), (1, 2, 3)).save(big, format="PNG")
    wire.handlers[POLL] = httpx.Response(200, content=big.getvalue(), headers={"content-type": "image/png"})
    with studio_client(settings, wire) as c:
        assert c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h).status_code == 502


@pytest.mark.parametrize("status,expected,needle", [(401, 503, "key was rejected"), (403, 503, "key was rejected"), (402, 503, "run out of credits"),
                                                    (429, 429, "busy"), (400, 422, "could not use"), (500, 502, "not answering"),
                                                    (502, 502, "not answering"), (503, 502, "not answering")])
def test_image_error_mapping_and_quota_refund(settings, wire, status, expected, needle):
    with studio_client(settings, wire, studio_daily_image_quota=1) as c:
        wire.handlers[POLL] = httpx.Response(status, text="provider said PRIVATE detail", headers={"retry-after": "7"} if status == 429 else {})
        r = c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h)
        assert r.status_code == expected and needle in r.json()["detail"] and "PRIVATE" not in r.text
        if status == 429:
            assert r.headers["retry-after"] == "7"
        assert c.get("/api/studio/ai/status", headers=c.h).json()["image"]["used_today"] == 0  # refunded
        wire.handlers[POLL] = poll_ok()
        assert c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h).status_code == 200


def test_image_retries_5xx_then_succeeds_but_not_401(settings, wire):
    calls = {"n": 0}

    def flaky(request):
        calls["n"] += 1
        return httpx.Response(502) if calls["n"] < 3 else httpx.Response(200, content=wire.png, headers={"content-type": "image/png"})

    wire.handlers[POLL] = flaky
    with studio_client(settings, wire) as c:
        assert c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h).status_code == 200
        assert calls["n"] == 3
        wire.handlers[POLL] = httpx.Response(401)
        before = len(wire.to(POLL))
        assert c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h).status_code == 503
        assert len(wire.to(POLL)) == before + 1


def test_image_timeout_maps_to_502_and_refunds(settings, wire):
    def boom(request):
        raise httpx.ReadTimeout("slow", request=request)

    wire.handlers[POLL] = boom
    with studio_client(settings, wire, studio_daily_image_quota=1) as c:
        r = c.post("/api/studio/ai/image", json={"prompt": "logo"}, headers=c.h)
        assert r.status_code == 502 and "in time" in r.json()["detail"]
        assert c.get("/api/studio/ai/status", headers=c.h).json()["image"]["used_today"] == 0
    assert len(wire.to(POLL)) == 1 + settings.studio_ai_max_retries


def test_image_status_names_pollinations_only(settings, wire):
    with studio_client(settings, wire) as c:
        st = c.get("/api/studio/ai/status", headers=c.h).json()
    assert st["image"]["configured"] is True and st["image"]["provider"] == "pollinations"
    assert KEY_POLL not in json.dumps(st) and "hugging" not in json.dumps(st).lower()


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
    for key in (KEY_GROQ, KEY_GEMINI, KEY_POLL):
        assert key not in text
    assert json.loads(text)["chat"]["providers"] == ["groq", "gemini"]


def test_admin_login_still_works_with_the_proxy_installed(settings, wire):
    with studio_client(settings, wire) as c:
        assert headers_for(c, *ADMIN)
