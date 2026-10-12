import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas as S
from ..config import settings
from ..db import get_db
from ..models import Brand, User
from ..security import (admin_user, current_user, decode_token, hash_password, is_revoked, limiter, make_access_token, make_refresh_token,
                        make_reset_token, revoke, verify_password)
from ..services.common import write_audit

router = APIRouter(prefix="/api", tags=["auth"])
log = logging.getLogger("scammind.auth")
_DUMMY_HASH = hash_password("not-a-real-password")


def _tokens(user: User) -> S.TokenOut:
    return S.TokenOut(access_token=make_access_token(user), refresh_token=make_refresh_token(user),
                      expires_in=settings.access_token_minutes * 60, user=S.UserOut.model_validate(user))


@router.post("/auth/login", response_model=S.TokenOut)
@limiter.limit("5/minute")
def login(request: Request, body: S.LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)     # constant-ish time for unknown users
    if not user or not ok or not user.active:
        write_audit(db, None, "login failed", body.email[:120])
        raise HTTPException(401, "Incorrect email or password")
    write_audit(db, user, "login", user.email)
    return _tokens(user)


@router.post("/auth/refresh", response_model=S.TokenOut)
@limiter.limit("30/minute")
def refresh(request: Request, body: S.RefreshIn, db: Session = Depends(get_db)):
    claims = decode_token(body.refresh_token, "refresh")
    if is_revoked(db, claims["jti"]):
        raise HTTPException(401, "Refresh token was revoked")
    user = db.get(User, int(claims["sub"]))
    if not user or not user.active:
        raise HTTPException(401, "User is inactive or no longer exists")
    revoke(db, claims)                                 # rotate: a refresh token works once
    return _tokens(user)


@router.post("/auth/logout", response_model=S.Ok)
def logout(body: S.LogoutIn, db: Session = Depends(get_db)):
    if body.refresh_token:
        try:
            revoke(db, decode_token(body.refresh_token, "refresh"))
        except HTTPException:
            pass
    return S.Ok(detail="Logged out")


@router.post("/auth/register", response_model=S.UserOut, status_code=201)
def register(body: S.RegisterIn, db: Session = Depends(get_db), admin: User = Depends(admin_user)):
    email = body.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "A user with that email already exists")
    u = User(name=body.name.strip(), email=email, password_hash=hash_password(body.password), role=body.role)
    db.add(u)
    db.commit()
    write_audit(db, admin, "create user", email, f"role={body.role}")
    return u


@router.post("/auth/forgot", response_model=S.Ok)
@limiter.limit("5/minute")
def forgot(request: Request, body: S.ForgotIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user and user.active:
        token = make_reset_token(user)
        if settings.env != "production":
            log.warning("PASSWORD RESET TOKEN for %s: %s", user.email, token)       # dev: no email service, the token goes to the console
            print(f"[scammind] password reset token for {user.email}: {token}", flush=True)
        write_audit(db, user, "password reset requested", user.email)
    return S.Ok(detail="If that account exists, a reset link has been sent.")        # same answer either way


@router.post("/auth/reset", response_model=S.Ok)
@limiter.limit("5/minute")
def reset(request: Request, body: S.ResetIn, db: Session = Depends(get_db)):
    claims = decode_token(body.token, "reset")
    user = db.get(User, int(claims["sub"]))
    if not user or user.password_hash[-12:] != claims.get("pw"):
        raise HTTPException(400, "This reset link is no longer valid")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    write_audit(db, user, "password reset", user.email)
    return S.Ok(detail="Password updated")


@router.get("/me", response_model=S.MeOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    first = db.scalar(select(Brand.id).order_by(Brand.id).limit(1))
    return S.MeOut(**S.UserOut.model_validate(user).model_dump(), default_brand_id=first)
