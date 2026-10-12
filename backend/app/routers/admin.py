import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas as S
from ..config import settings
from ..db import get_db
from ..models import Audit, Integration, User
from ..security import admin_user, analyst_user, hash_password
from ..services import integrations
from ..services.common import iso, write_audit

router = APIRouter(prefix="/api", tags=["admin"])


@router.get("/health", response_model=S.HealthOut)
def health():
    return S.HealthOut(ok=True, time=time.time(), demo_mode=settings.demo_mode, version="1.0")


@router.get("/audit", response_model=list[S.AuditOut])
def get_audit(limit: int = 100, db: Session = Depends(get_db), user: User = Depends(analyst_user)):
    rows = db.scalars(select(Audit).order_by(Audit.ts.desc(), Audit.id.desc()).limit(min(max(limit, 1), 1000))).all()
    names = {u.id: u.name for u in db.scalars(select(User))}
    return [S.AuditOut(id=a.id, ts=iso(a.ts), actor=names.get(a.actor_id) if a.actor_id else "system", action=a.action, target=a.target, detail=a.detail) for a in rows]


def _integration_out(row: Integration) -> S.IntegrationOut:
    d = integrations.DEFAULTS.get(row.name, {"label": row.name, "needs_key": False})
    return S.IntegrationOut(name=row.name, label=d["label"], enabled=row.enabled, needs_key=d["needs_key"], key_present=integrations.key_present(row.name),
                            config={k: v for k, v in (row.config or {}).items() if "key" not in k.lower() and "secret" not in k.lower()})


@router.get("/settings/integrations", response_model=list[S.IntegrationOut])
def get_integrations(db: Session = Depends(get_db), user: User = Depends(admin_user)):
    integrations.ensure_defaults(db)
    return [_integration_out(r) for r in db.scalars(select(Integration).order_by(Integration.name))]


@router.put("/settings/integrations", response_model=list[S.IntegrationOut])
def put_integrations(body: list[S.IntegrationIn], db: Session = Depends(get_db), user: User = Depends(admin_user)):
    """Enable or disable integrations. API keys are read from environment variables only and are never stored or returned."""
    for item in body:
        if item.name not in integrations.DEFAULTS:
            raise HTTPException(422, f"Unknown integration: {item.name}")
        if any("key" in k.lower() or "secret" in k.lower() for k in item.config):
            raise HTTPException(422, "Put API keys in environment variables, not in settings")
    integrations.ensure_defaults(db)
    for item in body:
        row = db.get(Integration, item.name)
        row.enabled, row.config = item.enabled, item.config
    db.commit()
    write_audit(db, user, "integrations updated", ", ".join(f"{i.name}={'on' if i.enabled else 'off'}" for i in body))
    return [_integration_out(r) for r in db.scalars(select(Integration).order_by(Integration.name))]


@router.get("/users", response_model=list[S.UserOut])
def list_users(db: Session = Depends(get_db), user: User = Depends(admin_user)):
    return list(db.scalars(select(User).order_by(User.id)))


@router.post("/users", response_model=S.UserOut, status_code=201)
def create_user(body: S.RegisterIn, db: Session = Depends(get_db), admin: User = Depends(admin_user)):
    email = body.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "A user with that email already exists")
    u = User(name=body.name.strip(), email=email, password_hash=hash_password(body.password), role=body.role)
    db.add(u)
    db.commit()
    write_audit(db, admin, "create user", email, f"role={body.role}")
    return u


@router.patch("/users/{uid}", response_model=S.UserOut)
def patch_user(uid: int, body: S.UserPatch, db: Session = Depends(get_db), admin: User = Depends(admin_user)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found")
    changes = []
    if body.name is not None:
        u.name = body.name.strip()
    if body.role is not None:
        if u.id == admin.id and body.role != "admin":
            raise HTTPException(409, "You cannot remove your own admin role")
        changes.append(f"role {u.role} -> {body.role}")
        u.role = body.role
    if body.active is not None:
        if u.id == admin.id and not body.active:
            raise HTTPException(409, "You cannot deactivate yourself")
        changes.append(f"active -> {body.active}")
        u.active = body.active
    if body.password:
        u.password_hash = hash_password(body.password)
        changes.append("password reset")
    db.commit()
    write_audit(db, admin, "update user", u.email, "; ".join(changes))
    return u
