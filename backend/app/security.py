"""Passwords (bcrypt), JWTs (HS256), role checks, rate limiting."""
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import RevokedToken, User, utcnow

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)
ALGO = "HS256"
ROLE_RANK = {"viewer": 1, "analyst": 2, "admin": 3}

limiter = Limiter(key_func=get_remote_address, enabled=settings.rate_limit_enabled, headers_enabled=False)


def hash_password(p: str) -> str:
    return pwd.hash(p)


def verify_password(p: str, h: str) -> bool:
    try:
        return pwd.verify(p, h)
    except Exception:
        return False


def _encode(claims: dict, minutes: float) -> str:
    now = datetime.now(UTC)
    payload = {**claims, "iat": now, "exp": now + timedelta(minutes=minutes), "jti": uuid.uuid4().hex}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGO)


def make_access_token(user: User) -> str:
    return _encode({"sub": str(user.id), "role": user.role, "type": "access"}, settings.access_token_minutes)


def make_refresh_token(user: User) -> str:
    return _encode({"sub": str(user.id), "type": "refresh"}, settings.refresh_token_days * 24 * 60)


def make_reset_token(user: User) -> str:
    # bound to the current password hash, so it stops working once the password changes (single use)
    return _encode({"sub": str(user.id), "type": "reset", "pw": user.password_hash[-12:]}, 30)


def decode_token(token: str, expected_type: str) -> dict:
    try:
        claims = jwt.decode(token, settings.secret_key, algorithms=[ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired", headers={"WWW-Authenticate": "Bearer"})
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token", headers={"WWW-Authenticate": "Bearer"})
    if claims.get("type") != expected_type:
        raise HTTPException(401, "Wrong token type", headers={"WWW-Authenticate": "Bearer"})
    return claims


def is_revoked(db: Session, jti: str) -> bool:
    return db.get(RevokedToken, jti) is not None


def revoke(db: Session, claims: dict):
    if not is_revoked(db, claims["jti"]):
        db.add(RevokedToken(jti=claims["jti"], expires_at=datetime.fromtimestamp(claims["exp"], UTC).replace(tzinfo=None)))
        db.commit()


def purge_revoked(db: Session):
    for r in db.scalars(select(RevokedToken).where(RevokedToken.expires_at < utcnow())):
        db.delete(r)
    db.commit()


def current_user(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not creds:
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    claims = decode_token(creds.credentials, "access")
    user = db.get(User, int(claims["sub"]))
    if not user or not user.active:
        raise HTTPException(401, "User is inactive or no longer exists")
    request.state.user = user
    return user


def require_role(minimum: str):
    """Dependency factory: viewer < analyst < admin. The role comes from the database, not from the token."""
    def dep(user: User = Depends(current_user)) -> User:
        if ROLE_RANK.get(user.role, 0) < ROLE_RANK[minimum]:
            raise HTTPException(403, f"Requires the {minimum} role")
        return user
    return dep


viewer_user = require_role("viewer")
analyst_user = require_role("analyst")
admin_user = require_role("admin")
