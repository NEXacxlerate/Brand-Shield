"""POST /api/voice: fast path, follow-up questions, safety gate and validation of what Gemini proposes (no network)."""
from types import SimpleNamespace

from app.services.voice import NOT_UNDERSTOOD, normalize_value

ROUTES = [{"path": "/dashboard", "spoken_names": ["dashboard"]}, {"path": "/reports", "spoken_names": ["reports"]},
          {"path": "/admin/secret", "spoken_names": ["secret admin"]}]
SNAP = [
    {"i": "v1", "t": "input", "l": "Company name", "n": "brand_name"},
    {"i": "v2", "t": "select", "l": "Industry", "n": "industry", "v": "", "o": ["Fashion", "Fintech", "Food"]},
    {"i": "v3", "t": "button", "l": "Delete brand"},
    {"i": "v4", "t": "button", "l": "Save resolution"},
    {"i": "v5", "t": "button", "l": "Create brand"},
]


def ask(client, h, text, pending=None, snapshot=SNAP, **extra):
    body = {"text": text, "route": "/setup", "title": "Setup", "routes": ROUTES, "snapshot": snapshot, "pending": pending, **extra}
    r = client.post("/api/voice", json=body, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_fast_commands_and_pending_question_cancelled_by_a_new_command(client, admin_h):
    assert ask(client, admin_h, "scroll down")["actions"] == [{"type": "scroll", "direction": "down"}]
    assert ask(client, admin_h, "open dashboard")["actions"] == [{"type": "navigate", "path": "/dashboard"}]
    pending = {"kind": "provide_value", "field_id": "v1", "question": "What is the brand name?"}
    r = ask(client, admin_h, "open dashboard", pending=pending)
    assert r["cancel_pending"] and r["actions"] == [{"type": "navigate", "path": "/dashboard"}]


def test_partial_fill_asks_then_fills_the_answer(client, admin_h):
    r = ask(client, admin_h, "fill brand name as Nexa")
    assert r["actions"][0]["type"] == "fill" and r["actions"][0]["value"] == "Nexa"
    assert r["ask"]["kind"] == "confirm" and "industry" in r["ask"]["question"]
    r = ask(client, admin_h, "yes", pending=r["ask"])
    assert r["ask"]["kind"] == "choose_option" and r["ask"]["options"] == ["Fashion", "Fintech", "Food"]
    r = ask(client, admin_h, "fashion", pending=r["ask"])
    assert r["actions"] == [{"type": "select", "id": "v2", "option": "Fashion", "label": "industry"}] and r["finish"]


def test_ambiguous_option_is_asked_again_and_skip_ends(client, admin_h):
    pending = {"kind": "choose_option", "field_id": "v2", "options": ["Fashion", "Fintech", "Food"], "question": "Which industry?"}
    r = ask(client, admin_h, "f", pending=pending)
    assert r["ask"] and r["actions"] == []
    assert ask(client, admin_h, "skip", pending=pending)["finish"]


def test_guided_form_goes_field_by_field(client, admin_h):
    r = ask(client, admin_h, "help me fill this form")
    assert r["ask"]["guided"] and r["ask"]["field_id"] == "v1"
    r = ask(client, admin_h, "Nexa", pending=r["ask"])
    assert r["actions"][0]["value"] == "Nexa" and r["ask"]["field_id"] == "v2"


def test_safety_gate_and_sensitive_fields(client, admin_h, monkeypatch):
    agent = client.app.state.voice_agent
    monkeypatch.setattr(agent, "_key", "k")
    calls = [SimpleNamespace(name="click", args={"id": "v3"})]
    monkeypatch.setattr(agent, "_client", SimpleNamespace(models=SimpleNamespace(generate_content=lambda **kw: SimpleNamespace(function_calls=calls))))
    r = ask(client, admin_h, "get rid of this brand")
    assert r["actions"] == [] and r["ask"]["kind"] == "confirm" and r["ask"]["then"][0]["id"] == "v3"
    r2 = ask(client, admin_h, "yes", pending=r["ask"])
    assert r2["actions"][0]["id"] == "v3"
    calls[:] = [SimpleNamespace(name="click", args={"id": "v5"}), SimpleNamespace(name="reply", args={"text": "x"})]
    assert "Should I submit?" in ask(client, admin_h, "go ahead with it")["ask"]["question"]
    calls[:] = [SimpleNamespace(name="click", args={"id": "v4"}), SimpleNamespace(name="finish", args={"summary": "Saved."})]
    assert ask(client, admin_h, "save resolution")["actions"][0]["id"] == "v4"  # explicitly asked: no confirmation
    assert ask(client, admin_h, "fill the password with abc")["actions"] == [{"type": "highlight"}]


def test_gemini_answer_is_validated_and_failures_are_friendly(client, admin_h, monkeypatch):
    agent = client.app.state.voice_agent
    monkeypatch.setattr(agent, "_key", "k")
    calls = [SimpleNamespace(name="navigate", args={"path": "/admin/secret"}), SimpleNamespace(name="click", args={"id": "v99"}),
             SimpleNamespace(name="select_option", args={"id": "v2", "option": "fintech"}), SimpleNamespace(name="finish", args={"summary": "Done."})]
    monkeypatch.setattr(agent, "_client", SimpleNamespace(models=SimpleNamespace(generate_content=lambda **kw: SimpleNamespace(function_calls=calls))))
    r = ask(client, admin_h, "make it a fintech company")
    assert r["actions"] == [{"type": "select", "id": "v2", "option": "Fintech", "label": "industry"}] and r["finish"]

    def boom(**kw):
        raise TimeoutError("slow")

    monkeypatch.setattr(agent, "_client", SimpleNamespace(models=SimpleNamespace(generate_content=boom)))
    assert ask(client, admin_h, "what is the meaning of life")["reply"] == NOT_UNDERSTOOD


def test_needs_sign_in_and_helpers(client):
    assert client.post("/api/voice", json={"text": "open dashboard"}).status_code == 401
    assert normalize_value("alert_email", "Rahul dot V at example dot co dot in") == "rahul.v@example.co.in"
