# ruff: noqa: E501
"""Voice agent: a page-aware controller. One spoken sentence becomes a few UI actions on the page snapshot the browser sends
(navigate, scroll, click, select an option, fill a field, toggle), or ONE short follow-up question when something is missing.

The browser runs a loop: snapshot -> POST /api/voice -> execute the actions -> wait for the page to settle -> new snapshot -> ...
until the answer says `finish` (or asks a question, or a limit is hit).

Order of work, cheapest first:
1. pending question: the next utterance is its answer, unless it is clearly a new command (open/scroll/back/stop);
2. fast path (regex + rapidfuzz, no network): open <page>, scroll, go back, close, stop, "fill <field> as <value>", corrections,
   "fill the whole form";
3. Gemini (google-genai) with function calling over the snapshot.

Everything is validated here: paths against the allowlist, element ids against the snapshot that was sent, option names against that
element's real options, no sensitive fields ever, destructive clicks and unrequested submits only after a spoken yes. Snapshots, values
and the API key are never logged.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

from rapidfuzz import fuzz

from app.config.config import Settings

log = logging.getLogger("app.voice")

ALLOWED_PATHS = frozenset({
    "/dashboard", "/brand", "/social", "/apps", "/web", "/investigations", "/lookalike", "/sources", "/reports", "/settings",
    "/evaluation", "/setup", "/protect-brand", "/studio/",
})
SENSITIVE = re.compile(r"pass(word|code)?|pwd|secret|token|\botp\b|one.?time|\bpin\b|cvv|cvc|card|credit|ssn|api.?key|credential|auth", re.I)
DESTRUCTIVE = re.compile(r"\b(delete|remove|block|pay|payment|purchase|buy|archive|discard|revoke|erase|terminate|deactivate)\b", re.I)
SUBMIT = re.compile(r"\b(submit|register|create|finish|publish|launch|send|save|confirm)\b", re.I)
YES = re.compile(r"^(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|correct|confirm|submit|affirmative)\b")
NO = re.compile(r"^(no|nope|nah|don'?t|do not|negative)\b")
SKIP = re.compile(r"^(skip|pass|next|leave it|later)\b")
THATS_ALL = re.compile(r"^(that'?s all|that is all|that'?s it|no more|nothing else|i'?m done|done|enough)\b")
STOP = re.compile(r"^(stop|cancel( that| it)?|never ?mind|abort|forget it)\b")

NOT_UNDERSTOOD = "Sorry, I didn't understand that. Try \"open reports\" or \"fill brand name as Acme\"."
NAV_SCORE = 82
FIELD_SCORE = 80
MAX_VALUE = 500
FALLBACK_WITHIN_SECONDS = 4.0

FILLABLE = {"input", "textarea"}
CHOICE = {"select", "dropdown"}
TOGGLE = {"checkbox", "radio", "switch"}
CLICKABLE = {"button", "link", "tab", "row", "dropdown", "checkbox", "radio", "switch", "option"}
FIELDS = FILLABLE | CHOICE


@dataclass
class Route:
    path: str
    spoken_names: list[str] = field(default_factory=list)


@dataclass
class VoiceResult:
    actions: list[dict[str, Any]] = field(default_factory=list)
    reply: str = ""
    ask: dict[str, Any] | None = None
    finish: bool = False
    cancel_pending: bool = False
    source: str = "fast"

    def as_dict(self) -> dict[str, Any]:
        return {"actions": self.actions, "reply": self.reply, "ask": self.ask, "finish": self.finish,
                "cancel_pending": self.cancel_pending, "source": self.source}


@dataclass
class Ctx:
    text: str
    route: str
    title: str
    routes: list[Route]
    snap: list[dict[str, Any]]
    done: list[dict[str, Any]]
    pending: dict[str, Any] | None
    turns: list[dict[str, str]]
    last_fill: dict[str, Any] | None

    @property
    def norm(self) -> str:
        return _norm(self.text)

    @property
    def ids(self) -> dict[str, dict[str, Any]]:
        return {e["i"]: e for e in self.snap}


# ------------------------------------------------------------------ text helpers


def _norm(s: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9@.+\-\s']", " ", s.lower()).split())


def _human(name: str) -> str:
    return " ".join(re.sub(r"([a-z])([A-Z])", r"\1 \2", name).replace("_", " ").replace("-", " ").lower().split())


def _label(e: dict[str, Any]) -> str:
    return e.get("l") or _human(e.get("n") or "") or e.get("t", "item")


def _say(e: dict[str, Any]) -> str:
    """How the field is spoken: its data-voice name when it has one, else its label."""
    return _human(e.get("n") or "") or _label(e)


def _is_sensitive(e: dict[str, Any]) -> bool:
    return bool(SENSITIVE.search(f"{e.get('l', '')} {e.get('n', '')}"))


def spoken_email(value: str) -> str:
    v = f" {value.strip().lower()} "
    for word, ch in ((" at the rate ", "@"), (" at ", "@"), (" dot ", "."), (" period ", "."), (" underscore ", "_"),
                     (" dash ", "-"), (" hyphen ", "-"), (" plus ", "+")):
        v = v.replace(word, ch)
    return "".join(v.split())


_DIGITS = {"zero": "0", "oh": "0", "o": "0", "one": "1", "two": "2", "to": "2", "too": "2", "three": "3", "four": "4", "for": "4",
           "five": "5", "six": "6", "seven": "7", "eight": "8", "ate": "8", "nine": "9"}


def spoken_phone(value: str) -> str:
    out: list[str] = []
    words = value.lower().replace("-", " ").split()
    i = 0
    while i < len(words):
        w = words[i]
        rep = {"double": 2, "triple": 3}.get(w)
        if rep and i + 1 < len(words) and words[i + 1] in _DIGITS:
            out.append(_DIGITS[words[i + 1]] * rep)
            i += 2
            continue
        if w == "plus":
            out.append("+")
        elif w in _DIGITS:
            out.append(_DIGITS[w])
        elif re.fullmatch(r"\+?\d+", w):
            out.append(w)
        i += 1
    return "".join(out)


def normalize_value(name: str, value: str) -> str:
    """Spoken forms to written ones for fields where that is obviously wanted (email, phone, URL/domain)."""
    name = name.lower()
    value = " ".join(value.split())[:MAX_VALUE]
    if "email" in name or (re.search(r"\bat\b", value) and re.search(r"\bdot\b", value) and len(value.split()) <= 8):
        return spoken_email(value)
    if any(k in name for k in ("phone", "mobile", "tel")):
        return spoken_phone(value) or value
    if any(k in name for k in ("url", "domain", "website", "webhook")):
        v = value.lower()
        for word, ch in (("dot", "."), ("slash", "/"), ("colon", ":"), ("dash", "-")):
            v = re.sub(r"\s*\b" + word + r"\b\s*", ch, v)
        return "".join(v.split())
    return value


def _score(target: str, name: str) -> float:
    name = _norm(name)
    if not name or not target:
        return 0.0
    if name == target:
        return 100.0
    return max(fuzz.ratio(target, name), fuzz.token_set_ratio(target, name) - 3)


def match_option(spoken: str, options: list[str]) -> tuple[str | None, list[str]]:
    """(the one option the person meant, or None; the close candidates when it is ambiguous)."""
    t = _norm(spoken)
    ordinals = {"first": 0, "1st": 0, "one": 0, "second": 1, "2nd": 1, "two": 1, "third": 2, "3rd": 2, "three": 2, "fourth": 3, "four": 3}
    if t in ordinals and ordinals[t] < len(options):
        return options[ordinals[t]], []
    scored = sorted(((max(_score(t, o), 100.0 if t and t in _norm(o) and len(t) >= 3 else 0.0), o) for o in options), reverse=True)
    close = [(s, o) for s, o in scored if s >= 75]
    if not close:
        return None, []
    if len(close) == 1 or close[0][0] >= 95 or close[0][0] - close[1][0] >= 12:
        return close[0][1], []
    return None, [o for _, o in close[:4]]


def _find_field(target: str, snap: list[dict[str, Any]], kinds: set[str]) -> dict[str, Any] | None:
    best, best_score = None, 0.0
    for e in snap:
        if e.get("t") not in kinds or e.get("d") or _is_sensitive(e):
            continue
        s = max(_score(target, e.get("l", "")), _score(target, _human(e.get("n") or "")))
        if s > best_score:
            best, best_score = e, s
    return best if best_score >= FIELD_SCORE else None


def _next_empty(snap: list[dict[str, Any]], after: str | None, skipped: list[str]) -> dict[str, Any] | None:
    seen_after = after is None
    for e in snap:
        if not seen_after:
            seen_after = e["i"] == after
            continue
        if e.get("t") in FIELDS and not e.get("d") and not e.get("v") and not _is_sensitive(e) and e["i"] not in skipped:
            return e
    return None


# ------------------------------------------------------------------ results


def _fill(e: dict[str, Any], value: str) -> dict[str, Any]:
    return {"type": "fill", "id": e["i"], "value": value, "label": _say(e)}


def _select(e: dict[str, Any], option: str) -> dict[str, Any]:
    return {"type": "select", "id": e["i"], "option": option, "label": _say(e)}


def _ask_value(e: dict[str, Any], *, guided: bool = False, skipped: list[str] | None = None, lead: str = "") -> dict[str, Any]:
    name = _say(e)
    opts = [o for o in e.get("o", []) if o][:40]
    base: dict[str, Any] = {"field_id": e["i"], "guided": guided, "skipped": skipped or []}
    if opts and len(opts) <= 4:
        return {**base, "kind": "choose_option", "options": opts, "question": f"{lead}Which {name}? {' or '.join(opts) if len(opts) == 2 else ', '.join(opts)}?"}
    return {**base, "kind": "provide_value", "options": [], "question": f"{lead}Which {name}?" if opts else f"{lead}What is the {name}?"}


def _choose(e: dict[str, Any], shown: list[str]) -> dict[str, Any]:
    return {"field_id": e["i"], "guided": False, "skipped": [], "kind": "choose_option", "options": shown[:4],
            "question": f"Which {_say(e)}? {', '.join(shown[:4])}?"}


def _follow_up(snap: list[dict[str, Any]], after: str) -> dict[str, Any] | None:
    nxt = _next_empty(snap, after, [])
    if not nxt:
        return None
    return {"kind": "confirm", "field_id": nxt["i"], "options": ["Yes", "Skip", "That's all"], "follow_up": True,
            "question": f"Do you want me to fill {_say(nxt)} too?"}


def _fill_result(e: dict[str, Any], value: str, snap: list[dict[str, Any]], *, follow: bool = True) -> VoiceResult:
    value = normalize_value(e.get("n") or e.get("l") or "", value)
    ask = _follow_up(snap, e["i"]) if follow else None
    return VoiceResult([_fill(e, value)], f"Filled {_say(e)} with {value}.", ask, finish=ask is None)


# ------------------------------------------------------------------ fast commands (no network)

_NAV = re.compile(
    r"^(?:please\s+|can you\s+|could you\s+)?(?:open|go to|goto|go|take me to|bring me to|show me|show|navigate to|switch to|launch|visit)"
    r"\s+(?:the\s+|my\s+|to\s+)?(?P<target>.+?)(?:\s+(?:page|screen|tab|section))?(?:\s+please)?$"
)
_SCROLL = re.compile(r"^(?:please\s+)?(?:scroll|move|page)\s*(?:the page\s*)?(?P<d>up|down)\b|"
                     r"^(?:go|scroll|jump)\s+to\s+(?:the\s+)?(?P<e>top|bottom)\b|^(?P<f>top|bottom) of (?:the )?page$")
_BACK = re.compile(r"^(?:please\s+)?(?:go\s+)?back$|^go back\b|^previous page$|^take me back$")
_CLOSE = re.compile(r"^(?:please\s+)?(?:close|dismiss|exit)(?:\s+(?:the\s+)?(?:popup|pop up|modal|dialog|window|panel))?$")
_WHERE = re.compile(r"^(?:what|which) (?:page|screen) (?:am i on|is this)|^where am i$")
_GUIDED = re.compile(r"(?:fill|complete|finish)\s+(?:out\s+)?(?:in\s+)?(?:the\s+|this\s+)?(?:whole|entire|complete|full)?\s*form|help me fill|"
                     r"fill (?:it|this) (?:in|out)")
_SENS_FILL = re.compile(r"\b(?:fill|enter|type|set|put|write)\b.*\b(?:password|passcode|otp|one time|card number|credit card|cvv|cvc|pin)\b")
_FILL = [
    re.compile(r"^(?:please\s+)?(?:fill(?:\s+in)?|set|enter|type|write|change|update|select|choose)\s+(?:the\s+|my\s+)?(?P<f>.+?)(?:\s+field|\s+box)?"
               r"\s+(?:with|to|as|equals|=)\s+(?P<v>.+)$"),
    re.compile(r"^(?:please\s+)?(?:put|enter|type|write|add)\s+(?P<v>.+?)\s+(?:in|into|as)\s+(?:the\s+|my\s+)?(?P<f>.+?)(?:\s+field|\s+box)?$"),
    re.compile(r"^(?:my\s+|the\s+)?(?P<f>.+?)\s+is\s+(?P<v>.+)$"),
]
_CORRECT = re.compile(r"^(?:no[, ]+)?(?:change (?:it )?to|make it|it'?s|it is|actually|set it to|should be)\s+(?P<v>.+)$")
_CLEAR = re.compile(r"^(?:please\s+)?(?:clear|erase|empty|delete)\s+(?:that|it|this|the last)(?:\s+field)?$")
_UNDO = re.compile(r"^(?:please\s+)?undo(?:\s+that)?$")


def _route_name(path: str, routes: list[Route], title: str = "") -> str:
    for r in routes:
        if r.path == path and r.spoken_names:
            return r.spoken_names[0]
    return title or path.strip("/").replace("-", " ") or "home"


def _best_route(target: str, routes: list[Route]) -> str | None:
    best, best_score = None, 0.0
    for r in routes:
        for n in [*r.spoken_names, r.path.strip("/").replace("-", " ")]:
            s = _score(target, n)
            if s > best_score:
                best, best_score = r.path, s
    return best if best_score >= NAV_SCORE else None


def fast_command(c: Ctx) -> VoiceResult | None:
    """Commands that never need Gemini and are also allowed to cancel a pending question."""
    t = c.norm
    if not t:
        return None
    if STOP.match(t) and len(t.split()) <= 3:
        return VoiceResult(reply="Stopped.", finish=True)
    if _WHERE.match(t):
        return VoiceResult(reply=f"You are on {_route_name(c.route, c.routes, c.title)}.", finish=True)
    m = _SCROLL.match(t)
    if m:
        d = m.group("d") or m.group("e") or m.group("f")
        return VoiceResult([{"type": "scroll", "direction": d}], f"Scrolling {d}.", finish=True)
    if _BACK.match(t):
        return VoiceResult([{"type": "back"}], "Going back.", finish=True)
    if _CLOSE.match(t):
        return VoiceResult([{"type": "close"}], "Closed.", finish=True)
    words = t.split()
    m = _NAV.match(t)
    targets = [m.group("target")] if m and len(m.group("target").split()) <= 4 and len(words) <= 7 else []
    if len(words) <= 3:
        targets.append(t)
    for target in targets:
        path = _best_route(target, c.routes)
        if path:
            return VoiceResult([{"type": "navigate", "path": path}], f"Opening {_route_name(path, c.routes)}.", finish=True)
    return None


def _mentions_other_field(value: str, chosen: dict[str, Any], snap: list[dict[str, Any]]) -> bool:
    if not re.search(r"\b(and|then|also)\b", value):
        return False
    return any(e is not chosen and e.get("t") in FIELDS and _say(e) in value for e in snap)


def _original_tail(raw: str, normalised_value: str) -> str:
    words = raw.split()
    n = len(normalised_value.split())
    if 0 < n <= len(words):
        candidate = " ".join(words[-n:])
        if _norm(candidate) == normalised_value:
            return candidate
    return normalised_value


def fast_fill(c: Ctx) -> VoiceResult | None:
    t = c.norm
    raw = " ".join(c.text.split())
    lf = c.last_fill
    if lf and lf.get("i") in c.ids:
        target = c.ids[lf["i"]]
        if _CLEAR.match(t):
            return VoiceResult([_fill(target, "")], f"Cleared {_say(target)}.", finish=True)
        if _UNDO.match(t):
            return VoiceResult([_fill(target, str(lf.get("prev", "")))], f"Restored {_say(target)}.", finish=True)
        m = _CORRECT.match(t)
        if m:
            return _fill_result(target, _original_tail(raw, m.group("v")), c.snap, follow=False)
    if _SENS_FILL.search(t):
        return VoiceResult([{"type": "highlight"}], "Please type this field yourself.", finish=True)
    if _GUIDED.search(t):
        first = _next_empty(c.snap, None, [])
        if not first:
            return VoiceResult(reply="There is nothing left to fill on this page.", finish=True)
        return VoiceResult(ask=_ask_value(first, guided=True, lead="Okay. "))
    for rx in _FILL:
        m = rx.match(t)
        if not m:
            continue
        e = _find_field(m.group("f"), c.snap, FIELDS)
        if not e or _mentions_other_field(m.group("v"), e, c.snap):
            continue
        value = _original_tail(raw, m.group("v"))
        if e["t"] in CHOICE:
            opts = [o for o in e.get("o", []) if o]
            if not opts:
                return VoiceResult([_select(e, value)], f"Selected {value} for {_say(e)}.", finish=True)
            best, amb = match_option(value, opts)
            if best:
                ask = _follow_up(c.snap, e["i"])
                return VoiceResult([_select(e, best)], f"Selected {best} for {_say(e)}.", ask, finish=ask is None)
            return VoiceResult(ask=_choose(e, amb or opts))
        return _fill_result(e, value, c.snap)
    return None


# ------------------------------------------------------------------ pending question


def _answer(c: Ctx) -> VoiceResult | None:
    p = c.pending or {}
    t = c.norm
    cmd = fast_command(c)
    if cmd:
        cmd.cancel_pending = True
        return cmd
    if STOP.match(t) or THATS_ALL.match(t):
        return VoiceResult(reply="Okay.", finish=True, cancel_pending=True)
    kind = p.get("kind")
    ids = c.ids
    field_el = ids.get(str(p.get("field_id", "")))
    skipped = [str(x) for x in p.get("skipped", [])][:60]
    then = [a for a in p.get("then", []) if isinstance(a, dict) and a.get("id") in ids and a.get("type") in ("click", "toggle")]

    if kind == "confirm":
        if YES.match(t):
            if p.get("then"):
                if not then:
                    return VoiceResult(reply="That control is no longer on the page.", finish=True, cancel_pending=True)
                return VoiceResult(then, "Done.", finish=True, cancel_pending=True)
            if field_el:
                return VoiceResult(ask=_ask_value(field_el))
            return VoiceResult(reply="Okay.", finish=True, cancel_pending=True)
        if NO.match(t) or SKIP.match(t):
            return VoiceResult(reply="Okay, I won't." if p.get("then") else "Okay.", finish=True, cancel_pending=True)
        return VoiceResult(reply="Please say yes or no.", ask=p)

    if not field_el:
        return None
    guided = bool(p.get("guided"))
    if SKIP.match(t):
        skipped.append(field_el["i"])
        nxt = _next_empty(c.snap, field_el["i"], skipped) if guided else None
        if nxt:
            return VoiceResult(reply="Skipped.", ask=_ask_value(nxt, guided=True, skipped=skipped))
        return VoiceResult(reply="Okay.", finish=True, cancel_pending=True)

    spoken = " ".join(c.text.split())
    opts = [o for o in field_el.get("o", []) if o] or [o for o in p.get("options", []) if isinstance(o, str)]
    if kind == "choose_option" or (field_el.get("t") in CHOICE and opts):
        best, amb = match_option(spoken, opts)
        if not best:
            shown = (amb or opts)[:4]
            return VoiceResult(reply="" if amb else "I didn't catch that.",
                               ask={**p, "options": shown, "kind": "choose_option", "question": f"Which {_say(field_el)}? {', '.join(shown)}?"})
        action, said = _select(field_el, best), f"Selected {best} for {_say(field_el)}."
    elif field_el.get("t") in CHOICE:  # a custom dropdown whose options are unknown until it is opened
        action, said = _select(field_el, spoken), f"Selected {spoken} for {_say(field_el)}."
    else:
        value = normalize_value(field_el.get("n") or field_el.get("l") or "", spoken)
        action, said = _fill(field_el, value), f"Filled {_say(field_el)} with {value}."
    if guided:
        nxt = _next_empty(c.snap, field_el["i"], skipped)
        if nxt:
            return VoiceResult([action], said, _ask_value(nxt, guided=True, skipped=skipped), cancel_pending=True)
        return VoiceResult([action], f"{said} That's the whole form.", finish=True, cancel_pending=True)
    return VoiceResult([action], said, finish=True, cancel_pending=True)


# ------------------------------------------------------------------ safety gate


def _explicit(label: str, text: str) -> bool:
    return any(w.lower() in text for w in SUBMIT.findall(label))


def gate(r: VoiceResult, c: Ctx) -> VoiceResult:
    """Destructive clicks need a spoken yes; submitting a form the person did not ask to submit is read back first."""
    ids = c.ids
    kept: list[dict[str, Any]] = []
    for a in r.actions:
        e = ids.get(a.get("id", ""))
        if a.get("type") in ("click", "toggle") and e:
            label = _label(e)
            question = ""
            if DESTRUCTIVE.search(label):
                question = f"Do you want me to {label.lower()}? Say yes or no."
            elif a["type"] == "click" and SUBMIT.search(label) and not _explicit(label, c.norm):
                filled = [f"{_say(x)} {x['v']}" for x in c.snap if x.get("t") in FIELDS and x.get("v") and not _is_sensitive(x)][:5]
                question = (", ".join(filled)[:140] + ". " if filled else "") + "Should I submit?"
            if question:
                r.actions, r.finish, r.reply = kept, False, ""
                r.ask = {"kind": "confirm", "options": ["Yes", "No"], "then": [a], "question": question}
                return r
        kept.append(a)
    r.actions = kept
    return r


def validation_follow_up(c: Ctx) -> VoiceResult | None:
    """The page shows a validation error on a field that was just filled: read it and ask for a corrected value."""
    touched = {s.get("i") for s in c.done if s.get("a") in ("fill", "select")}
    for e in c.snap:
        if e.get("e") and e["i"] in touched and e.get("t") in FIELDS and not _is_sensitive(e):
            return VoiceResult(ask={**_ask_value(e), "question": f"{e['e'][:80]}. What should {_say(e)} be?", "kind": "provide_value", "options": []})
    return None


# ------------------------------------------------------------------ Gemini


class VoiceAgent:
    def __init__(self, settings: Settings) -> None:
        self.s = settings
        key = settings.voice_gemini_api_key or settings.gemini_api_key
        self._key = key.get_secret_value() if key else None
        self._client: Any = None

    @property
    def configured(self) -> bool:
        return bool(self._key)

    def _get_client(self) -> Any:
        if self._client is None:
            from google import genai  # imported lazily: keeps cold starts fast when the voice agent is unused
            from google.genai import types

            # one attempt only, with a hard timeout: a voice command that waits longer is worse than "please try again"
            opts = types.HttpOptions(timeout=int(max(10.0, self.s.voice_timeout_seconds) * 1000),
                                     retry_options=types.HttpRetryOptions(attempts=1))
            self._client = genai.Client(api_key=self._key, http_options=opts)
        return self._client

    def handle(self, c: Ctx) -> VoiceResult:
        c.text = " ".join(c.text.split())[:MAX_VALUE]
        c.routes = [r for r in c.routes if r.path in ALLOWED_PATHS]
        if not c.text:
            return VoiceResult(reply=NOT_UNDERSTOOD, finish=True, source="none")
        if c.pending:
            r = _answer(c)
            if r:
                return r
        elif c.done:
            err = validation_follow_up(c)
            if err:
                return err
        quick = fast_command(c) or fast_fill(c)
        if quick:
            return gate(quick, c)
        if not self.configured:
            return VoiceResult(reply="I can open pages, scroll and fill fields with simple commands, like \"open reports\".", finish=True, source="none")
        try:
            return gate(self._gemini(c), c)
        except Exception as exc:  # timeout, quota, network, unexpected answer: never an error page
            # type and status code only, never the message: it may echo the request
            code = getattr(exc, "code", "")
            log.warning("voice gemini call failed: %s %s", type(exc).__name__, code)
            busy = "The AI service is busy right now. Please try again in a moment."
            return VoiceResult(reply=busy if code in (429, 503, 504) else NOT_UNDERSTOOD, finish=True, source="none")

    def _gemini(self, c: Ctx) -> VoiceResult:
        from google.genai import types

        S = types.Schema
        ids = [e["i"] for e in c.snap]
        paths = [r.path for r in c.routes] or ["/dashboard"]
        fn = [
            types.FunctionDeclaration(name="navigate", description="Open a page.",
                                      parameters=S(type="OBJECT", properties={"path": S(type="STRING", enum=paths)}, required=["path"])),
            types.FunctionDeclaration(name="scroll", description="Scroll the page.",
                                      parameters=S(type="OBJECT", required=["direction"],
                                                   properties={"direction": S(type="STRING", enum=["up", "down", "top", "bottom"])})),
            types.FunctionDeclaration(
                name="find_element",
                description="Search the whole live page (off-screen items, lists, dropdown options) for a control by its visible text. Use when the target is not in the elements list.",
                parameters=S(type="OBJECT", required=["query"], properties={"query": S(type="STRING"), "type": S(type="STRING")})),
            types.FunctionDeclaration(name="wait", description="Wait for the page to load (milliseconds, at most 2000).",
                                      parameters=S(type="OBJECT", properties={"ms": S(type="INTEGER")}, required=["ms"])),
            types.FunctionDeclaration(name="reply", description="Say a short sentence.",
                                      parameters=S(type="OBJECT", properties={"text": S(type="STRING")}, required=["text"])),
            types.FunctionDeclaration(name="finish", description="The goal is complete: a short spoken summary of what was done.",
                                      parameters=S(type="OBJECT", properties={"summary": S(type="STRING")}, required=["summary"])),
            types.FunctionDeclaration(
                name="ask_user", description="Ask ONE short question (under 15 words) because a value is missing or ambiguous.",
                parameters=S(type="OBJECT", required=["question", "kind"], properties={
                    "question": S(type="STRING"), "kind": S(type="STRING", enum=["confirm", "choose_option", "provide_value"]),
                    "options": S(type="ARRAY", items=S(type="STRING")), "field_id": S(type="STRING")})),
        ]
        if ids:
            ident = S(type="STRING", enum=ids)
            fn += [
                types.FunctionDeclaration(name="click", description="Click a button, link, tab, row or dropdown.",
                                          parameters=S(type="OBJECT", properties={"id": ident}, required=["id"])),
                types.FunctionDeclaration(name="select_option", description="Choose an option in a select or dropdown.",
                                          parameters=S(type="OBJECT", properties={"id": ident, "option": S(type="STRING")}, required=["id", "option"])),
                types.FunctionDeclaration(name="fill_field", description="Type a value into a text field.",
                                          parameters=S(type="OBJECT", properties={"id": ident, "value": S(type="STRING")}, required=["id", "value"])),
                types.FunctionDeclaration(name="toggle", description="Switch a checkbox, radio or switch on or off.",
                                          parameters=S(type="OBJECT", properties={"id": ident, "on": S(type="BOOLEAN")}, required=["id"])),
            ]
        system = (
            "You control the BrandShield web UI using the given page snapshot. Use only ids from it. Plan the minimal actions. "
            "If the target is on another page, navigate first and plan the rest after the next snapshot. Never invent values for names, "
            "emails, phones, addresses or IDs: if a value is missing or ambiguous call ask_user (one question, under 15 words, max 4 options). "
            "If the target isn't in the snapshot, call find_element instead of giving up or guessing; its result is in the next snapshot. "
            "Never say an element doesn't exist before find_element has failed. "
            "Elements: i=id t=type l=label n=field name v=value r=required d=disabled e=error o=options c=checked off=off-screen. "
            "Call finish with a short summary when the goal is complete, in the same turn as the last actions."
        )
        dump = {"separators": (",", ":"), "ensure_ascii": False}
        contents = (f"Goal: {c.text}\nPage: {c.route} | {c.title[:60]}\nDone so far: {json.dumps(c.done[-12:], **dump)}\n"
                    f"Recent: {json.dumps(c.turns[-6:], **dump)}\nElements: {json.dumps(c.snap, **dump)}")

        def config(level: str) -> Any:
            return types.GenerateContentConfig(
                system_instruction=system, tools=[types.Tool(function_declarations=fn)],
                tool_config=types.ToolConfig(function_calling_config=types.FunctionCallingConfig(mode="ANY")),
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                temperature=0, max_output_tokens=512,
                thinking_config=types.ThinkingConfig(thinking_level=level) if level else None,
            )

        client = self._get_client()
        started = time.monotonic()
        try:
            resp = client.models.generate_content(model=self.s.voice_gemini_model, contents=contents, config=config(self.s.voice_thinking_level))
        except Exception as exc:
            fallback = self.s.voice_gemini_fallback_model
            if not fallback or fallback == self.s.voice_gemini_model or time.monotonic() - started > FALLBACK_WITHIN_SECONDS:
                raise
            log.info("voice: primary model refused (%s), trying the fallback", getattr(exc, "code", type(exc).__name__))
            resp = client.models.generate_content(model=fallback, contents=contents, config=config(""))
        return self._validate(resp.function_calls or [], c)

    @staticmethod
    def _validate(calls: list[Any], c: Ctx) -> VoiceResult:
        ids = c.ids
        allowed = {r.path for r in c.routes}
        actions: list[dict[str, Any]] = []
        out = VoiceResult(source="gemini")
        for call in calls[:14]:
            a = dict(call.args or {})
            e = ids.get(str(a.get("id", "")))
            n = call.name
            if n == "navigate" and a.get("path") in allowed and not any(x["type"] == "navigate" for x in actions):
                actions.append({"type": "navigate", "path": a["path"]})
            elif n == "scroll" and a.get("direction") in ("up", "down", "top", "bottom"):
                actions.append({"type": "scroll", "direction": a["direction"]})
            elif n == "find_element" and str(a.get("query", "")).strip() and not SENSITIVE.search(str(a["query"])):
                actions.append({"type": "find", "query": str(a["query"]).strip()[:60], "etype": str(a.get("type", ""))[:40]})
                break  # nothing after a search can be planned until its result is known
            elif n == "wait":
                actions.append({"type": "wait", "ms": max(0, min(2000, int(a.get("ms") or 500)))})
            elif n == "click" and e and e.get("t") in CLICKABLE and not e.get("d"):
                actions.append({"type": "click", "id": e["i"], "label": _label(e)})
            elif n == "toggle" and e and e.get("t") in TOGGLE and not e.get("d"):
                actions.append({"type": "toggle", "id": e["i"], "on": bool(a.get("on", True)), "label": _label(e)})
            elif n == "fill_field" and e and e.get("t") in FILLABLE and not e.get("d") and not _is_sensitive(e) and str(a.get("value", "")).strip():
                actions.append(_fill(e, normalize_value(e.get("n") or e.get("l") or "", str(a["value"]).strip())))
            elif n == "select_option" and e and e.get("t") in CHOICE and not e.get("d") and str(a.get("option", "")).strip():
                opts = [o for o in e.get("o", []) if o]
                if not opts:
                    actions.append(_select(e, str(a["option"]).strip()))
                    continue
                best, amb = match_option(str(a["option"]), opts)
                if not best:
                    out.ask = _choose(e, amb or opts)
                    break
                actions.append(_select(e, best))
            elif n == "ask_user" and str(a.get("question", "")).strip():
                kind = a.get("kind") if a.get("kind") in ("confirm", "choose_option", "provide_value") else "provide_value"
                known = {o for x in c.snap for o in x.get("o", [])} | {"Yes", "No", "Skip", "That's all"}
                options = [str(o)[:60] for o in (a.get("options") or []) if str(o) in known][:4]
                out.ask = {"kind": kind, "question": str(a["question"]).strip()[:140], "guided": False, "skipped": [],
                           "options": options or (["Yes", "No"] if kind == "confirm" else []), "field_id": a.get("field_id") if a.get("field_id") in ids else None}
                break
            elif n == "reply":
                out.reply = " ".join(str(a.get("text", "")).split())[:300]
            elif n == "finish":
                out.reply = " ".join(str(a.get("summary", "")).split())[:300] or out.reply
                out.finish = True
        out.actions = actions
        if out.ask:
            out.finish = False
        elif not actions and not out.reply:
            return VoiceResult(reply=NOT_UNDERSTOOD, finish=True, source="none")
        elif not actions:
            out.finish = True
        return out
