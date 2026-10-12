"""Small helpers shared by services and routers."""
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from ..models import Audit, User, utcnow

DAY = 86400.0


def to_epoch(dt: datetime) -> float:
    return dt.replace(tzinfo=UTC).timestamp()


def from_epoch(ts: float) -> datetime:
    return datetime.fromtimestamp(ts, UTC).replace(tzinfo=None)


def iso(dt: datetime | None) -> str | None:
    return dt.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z") if dt else None


def ago(dt: datetime | None, now: datetime | None = None) -> str:
    if not dt:
        return ""
    secs = max(0, int(((now or utcnow()) - dt).total_seconds()))
    if secs < 60:
        return "just now"
    if secs < 3600:
        m = secs // 60
        return f"{m} minute{'s' if m != 1 else ''} ago"
    if secs < 86400:
        h = secs // 3600
        return f"{h} hour{'s' if h != 1 else ''} ago"
    d = secs // 86400
    return f"{d} day{'s' if d != 1 else ''} ago"


def write_audit(db: Session, actor: User | int | None, action: str, target: str = "", detail: str = "", commit: bool = True):
    actor_id = actor.id if isinstance(actor, User) else actor
    db.add(Audit(actor_id=actor_id, action=action, target=target[:300], detail=detail))
    if commit:
        db.commit()


def verdict_label(score: float) -> str:
    return "Malicious" if score >= 80 else "Suspicious" if score >= 40 else "Clean"
