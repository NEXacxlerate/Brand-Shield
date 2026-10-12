from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import Setting, User
from app.services import audit

KEY = "data_mode"
MODES = ("live", "sample", "auto")
DEFAULT = "auto"


def get_data_mode(db: Session) -> str:
    row = db.scalar(select(Setting).where(Setting.key == KEY))
    return row.value if row is not None and row.value in MODES else DEFAULT


def set_data_mode(db: Session, mode: str, user: User) -> tuple[str, str]:
    """Persist the mode and add an audit row (committed together). Returns (old, new)."""
    if mode not in MODES:
        raise ValueError(f"data_mode must be one of {MODES}")
    row = db.scalar(select(Setting).where(Setting.key == KEY))
    old = row.value if row is not None and row.value in MODES else DEFAULT
    if row is None:
        db.add(Setting(key=KEY, value=mode, updated_by=user.id, updated_at=utcnow()))
    else:
        row.value, row.updated_by, row.updated_at = mode, user.id, utcnow()
    audit.record(db, user, "settings.data_mode_changed", KEY, f"{old} -> {mode}")
    db.commit()
    return old, mode
