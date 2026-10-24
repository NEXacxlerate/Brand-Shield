"""Voice agent endpoint. Signed-in users only; the Gemini key stays on the server (app/services/voice.py).

POST /api/voice  {text, route, title, routes, snapshot, done_steps, pending, last_turns, last_fill}
              -> {actions, reply, ask, finish, cancel_pending, source}
The browser sends a compact snapshot of the visible page elements and runs the returned actions, then calls again with a fresh snapshot
until `finish` (or `ask`). Ids, options and paths in the answer are validated against what was sent.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.config.deps import get_current_user
from app.models import User
from app.services.voice import SENSITIVE, Ctx, Route, VoiceAgent

router = APIRouter()


class RouteIn(BaseModel):
    path: str = Field(max_length=100)
    spoken_names: list[str] = Field(default_factory=list, max_length=10)


class Elem(BaseModel):
    i: str = Field(pattern=r"^v\d{1,5}$")
    t: str = Field(max_length=12)
    l: str = Field(default="", max_length=60)  # noqa: E741  (compact key on the wire)
    n: str | None = Field(default=None, max_length=60)
    v: str | None = Field(default=None, max_length=60)
    r: int | None = None
    d: int | None = None
    e: str | None = Field(default=None, max_length=100)
    o: list[str] = Field(default_factory=list, max_length=60)
    c: bool | None = None
    off: int | None = None


class VoiceBody(BaseModel):
    text: str = Field(max_length=1000)
    route: str = Field(default="/", max_length=200)
    title: str = Field(default="", max_length=120)
    routes: list[RouteIn] = Field(default_factory=list, max_length=50)
    snapshot: list[Elem] = Field(default_factory=list, max_length=200)
    done_steps: list[dict[str, Any]] = Field(default_factory=list, max_length=40)
    pending: dict[str, Any] | None = None
    last_turns: list[dict[str, str]] = Field(default_factory=list, max_length=6)
    last_fill: dict[str, Any] | None = None


@router.post("/voice")
def voice(body: VoiceBody, request: Request, user: User = Depends(get_current_user)) -> dict:
    if not request.app.state.voice_limiter.allow(f"user:{user.id}"):
        raise HTTPException(429, "Too many voice commands. Wait a moment and try again.", headers={"Retry-After": "20"})
    agent: VoiceAgent = request.app.state.voice_agent
    # whatever the browser says, sensitive fields never reach the planner
    snap = [e.model_dump(exclude_none=True) for e in body.snapshot if not SENSITIVE.search(f"{e.l} {e.n or ''}")]
    ctx = Ctx(
        text=body.text, route=body.route, title=body.title, routes=[Route(r.path, [n[:60] for n in r.spoken_names]) for r in body.routes],
        snap=snap, done=[{k: str(v)[:200] for k, v in s.items()} for s in body.done_steps], pending=body.pending,
        turns=[{k: v[:200] for k, v in t.items()} for t in body.last_turns], last_fill=body.last_fill,
    )
    return agent.handle(ctx).as_dict()
