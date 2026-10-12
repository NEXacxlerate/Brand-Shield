"""Data model. Datetimes are stored as naive UTC."""
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default="viewer")      # admin | analyst | viewer
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class RevokedToken(Base):
    """Refresh tokens that were logged out or rotated."""
    __tablename__ = "revoked_tokens"
    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class Brand(Base):
    __tablename__ = "brands"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    aliases: Mapped[list] = mapped_column(JSON, default=list)
    domains: Mapped[list] = mapped_column(JSON, default=list)
    handles: Mapped[dict] = mapped_column(JSON, default=dict)            # {platform: handle}
    app_ids: Mapped[list] = mapped_column(JSON, default=list)
    developers: Mapped[list] = mapped_column(JSON, default=list)
    cert_sha256: Mapped[str] = mapped_column(String(80), default="")
    permissions: Mapped[list] = mapped_column(JSON, default=list)
    phones: Mapped[list] = mapped_column(JSON, default=list)
    official_text: Mapped[str] = mapped_column(Text, default="")
    logo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)   # file name inside the logo dir
    logo_hash: Mapped[str | None] = mapped_column(String(16), nullable=True)    # 64-bit dHash as hex
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Entity(Base):
    __tablename__ = "entities"
    __table_args__ = (UniqueConstraint("brand_id", "type", "key"), Index("ix_entity_brand_campaign", "brand_id", "campaign_id"))
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id"), index=True)
    type: Mapped[str] = mapped_column(String(16))                        # social | website | app
    platform: Mapped[str] = mapped_column(String(32))
    key: Mapped[str] = mapped_column(String(300))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(16), default="sample")    # sample | live | user | connector
    first_seen: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    state_code: Mapped[str | None] = mapped_column(String(4), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="new")       # new | confirmed | dismissed | reported
    score: Mapped[float] = mapped_column(Float, default=0.0)
    severity: Mapped[str] = mapped_column(String(16), default="low")
    stage: Mapped[int] = mapped_column(Integer, default=1)               # 1..6
    campaign_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)  # id of the root entity of the campaign


class Signal(Base):
    __tablename__ = "signals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    label: Mapped[str] = mapped_column(String(120))
    strength: Mapped[float] = mapped_column(Float)
    weight: Mapped[float] = mapped_column(Float)
    points: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(Text)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)


class Identifier(Base):
    __tablename__ = "identifiers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(24))
    value: Mapped[str] = mapped_column(String(400), index=True)


class StageHistory(Base):
    __tablename__ = "stage_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id", ondelete="CASCADE"), index=True)
    from_stage: Mapped[int] = mapped_column(Integer)
    to_stage: Mapped[int] = mapped_column(Integer)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Investigation(Base):
    __tablename__ = "investigations"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)        # INV-YYYY-NNNN
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id"), index=True)
    input_type: Mapped[str] = mapped_column(String(24))
    input_value: Mapped[str] = mapped_column(Text)
    depth: Mapped[str] = mapped_column(String(8), default="quick")
    status: Mapped[str] = mapped_column(String(16), default="open")     # open | investigating | on_hold | resolved
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    state_code: Mapped[str | None] = mapped_column(String(4), nullable=True)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    notes: Mapped[list["Note"]] = relationship(back_populates="investigation", cascade="all, delete-orphan")


class Note(Base):
    __tablename__ = "notes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    investigation: Mapped[Investigation] = relationship(back_populates="notes")


class Evidence(Base):
    __tablename__ = "evidence"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    investigation_id: Mapped[str | None] = mapped_column(ForeignKey("investigations.id"), nullable=True, index=True)
    campaign_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    entity_id: Mapped[int | None] = mapped_column(ForeignKey("entities.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(32), default="file")
    filename: Mapped[str] = mapped_column(String(255))
    path: Mapped[str] = mapped_column(String(500))
    sha256: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer)
    mime: Mapped[str] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(32), default="user")
    captured_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Custody(Base):
    __tablename__ = "custody"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    evidence_id: Mapped[int] = mapped_column(ForeignKey("evidence.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(16))                       # captured | hashed | attached | downloaded
    actor: Mapped[str] = mapped_column(String(120))
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)           # REP-YYYY-NNN
    title: Mapped[str] = mapped_column(String(255), default="")
    brand_id: Mapped[int | None] = mapped_column(ForeignKey("brands.id"), nullable=True)
    campaign_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    investigation_id: Mapped[str | None] = mapped_column(ForeignKey("investigations.id"), nullable=True)
    format: Mapped[str] = mapped_column(String(8), default="pdf")        # pdf | json
    status: Mapped[str] = mapped_column(String(12), default="draft")     # draft | ready | approved
    scope: Mapped[str] = mapped_column(String(120), default="all")
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class WatchItem(Base):
    __tablename__ = "watchlist"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12))                         # domain | profile | phone | payment | app
    value: Mapped[str] = mapped_column(String(300))
    rules: Mapped[dict] = mapped_column(JSON, default=dict)
    last_state: Mapped[dict] = mapped_column(JSON, default=dict)
    last_checked: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="stable")     # stable | changed | spreading | offline
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    severity: Mapped[str] = mapped_column(String(12))
    title: Mapped[str] = mapped_column(String(300))
    detail: Mapped[str] = mapped_column(Text, default="")
    entity_id: Mapped[int | None] = mapped_column(ForeignKey("entities.id"), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Knowledge(Base):
    __tablename__ = "knowledge"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(12), default="seed")      # seed | learned
    campaign_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Audit(Base):
    __tablename__ = "audit"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    target: Mapped[str] = mapped_column(String(300), default="")
    detail: Mapped[str] = mapped_column(Text, default="")


class Integration(Base):
    __tablename__ = "integrations"
    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    config: Mapped[dict] = mapped_column(JSON, default=dict)


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    kind: Mapped[str] = mapped_column(String(24))
    state: Mapped[str] = mapped_column(String(12), default="running")    # running | done | error
    progress: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(String(300), default="")
    steps: Mapped[list] = mapped_column(JSON, default=list)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Metric(Base):
    """Daily dashboard aggregates. source=sample rows are the seeded history; live rows come from the nightly job."""
    __tablename__ = "metrics"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id"), index=True)
    key: Mapped[str] = mapped_column(String(40), index=True)
    day: Mapped[datetime] = mapped_column(Date)
    value: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(8), default="sample")
