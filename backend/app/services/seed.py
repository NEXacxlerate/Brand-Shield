import logging

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.config import Settings
from app.config.security import hash_password, verify_password
from app.models import User

log = logging.getLogger("app.seed")


def seed_admin(db: Session, settings: Settings) -> bool:
    """Create the admin from ADMIN_EMAIL / ADMIN_PASSWORD if absent. Never overwrites an existing password."""
    if not settings.admin_email or not settings.admin_password:
        return False
    email = settings.admin_email.strip().lower()
    if db.scalar(select(User.id).where(User.email == email)):
        return False
    db.add(User(name=settings.admin_name, email=email, password_hash=hash_password(settings.admin_password), role="admin"))
    db.commit()
    log.info("seeded admin user %s", email)
    return True


def demo_enabled(settings: Settings) -> bool:
    """A demo account is advertised only when both values are set and it cannot be mistaken for (or replace) the admin."""
    if not settings.demo_email or not settings.demo_password:
        return False
    return settings.demo_email.strip().lower() != (settings.admin_email or "").strip().lower()


def seed_demo(db: Session, settings: Settings) -> bool:
    """Create / keep in sync the public demo user (role analyst, never admin). The advertised password must keep working, so a changed
    DEMO_PASSWORD is applied at the next start. An existing account with another role (e.g. an admin) is never touched."""
    if not demo_enabled(settings):
        if settings.demo_email and settings.demo_password:
            log.warning("DEMO_EMAIL equals ADMIN_EMAIL: demo account disabled")
        return False
    email = settings.demo_email.strip().lower()  # type: ignore[union-attr]
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        db.add(User(name="Demo User", email=email, password_hash=hash_password(settings.demo_password), role="analyst"))  # type: ignore[arg-type]
        db.commit()
        log.info("seeded demo user %s", email)
        return True
    if user.role != "analyst":
        log.warning("demo account %s exists with role %s: left untouched and not advertised", email, user.role)
        return False
    changed = False
    if not verify_password(settings.demo_password, user.password_hash):  # type: ignore[arg-type]
        user.password_hash = hash_password(settings.demo_password)  # type: ignore[arg-type]
        changed = True
    if not user.active:
        user.active = True
        changed = True
    if changed:
        db.commit()
    return changed


def demo_admin_enabled(settings: Settings) -> bool:
    """Advertised only when both values are set and the email is neither the real admin's nor the analyst demo's."""
    if not settings.demo_admin_email or not settings.demo_admin_password:
        return False
    email = settings.demo_admin_email.strip().lower()
    return email not in {(settings.admin_email or "").strip().lower(), (settings.demo_email or "").strip().lower()}


def seed_demo_admin(db: Session, settings: Settings) -> bool:
    """Create / keep in sync the public DEMO ADMINISTRATOR (role admin, a dedicated account, never the real admin). An existing account with
    this email and a non-admin role is never touched or promoted. Its dangerous actions are refused at the endpoints (is_demo_admin)."""
    if not demo_admin_enabled(settings):
        if settings.demo_admin_email and settings.demo_admin_password:
            log.warning("DEMO_ADMIN_EMAIL equals ADMIN_EMAIL or DEMO_EMAIL: demo administrator disabled")
        return False
    email = settings.demo_admin_email.strip().lower()  # type: ignore[union-attr]
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        db.add(User(name="Demo Admin", email=email, password_hash=hash_password(settings.demo_admin_password), role="admin"))  # type: ignore[arg-type]
        db.commit()
        log.info("seeded demo administrator %s", email)
        return True
    if user.role != "admin":
        log.warning("demo administrator account %s exists with role %s: left untouched and not advertised", email, user.role)
        return False
    changed = False
    if not verify_password(settings.demo_admin_password, user.password_hash):  # type: ignore[arg-type]
        user.password_hash = hash_password(settings.demo_admin_password)  # type: ignore[arg-type]
        changed = True
    if not user.active:
        user.active = True
        changed = True
    if changed:
        db.commit()
    return changed


def demo_admin_advertised(db: Session, settings: Settings) -> bool:
    """Enabled AND the account really is the seeded admin (never advertise credentials that would not log in as the demo administrator)."""
    if not demo_admin_enabled(settings):
        return False
    user = db.scalar(select(User).where(User.email == settings.demo_admin_email.strip().lower()))  # type: ignore[union-attr]
    return bool(user and user.role == "admin" and user.active and verify_password(settings.demo_admin_password, user.password_hash))  # type: ignore[arg-type]


def is_demo_admin(user: User, settings: Settings) -> bool:
    """Is this the shared, public demo administrator (identified by its email)? The real admin is never matched."""
    return demo_admin_enabled(settings) and user.email.strip().lower() == settings.demo_admin_email.strip().lower()  # type: ignore[union-attr]


def forbid_demo_admin(user: User, settings: Settings, what: str) -> None:
    """403 when the shared demo administrator tries something that would affect everyone else."""
    if is_demo_admin(user, settings):
        raise HTTPException(403, f"Disabled for the shared demo administrator: {what}")
