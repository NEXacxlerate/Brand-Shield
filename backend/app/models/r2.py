"""Round 2 investigation models — completely independent of all Round 1 tables.

These tables hold analyst workflow state for the Round 2 layer.
They reference Round 1 detections by detection_id only; they never alter
any Round 1 row.
"""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.config.time import utcnow
from app.db.base import Base

R2_STATUS_NEW = "new"
R2_STATUS_UNDER_REVIEW = "under_review"
R2_STATUS_CONFIRMED = "confirmed"
R2_STATUS_FALSE_POSITIVE = "false_positive"
R2_STATUS_CLOSED = "closed"
R2_STATUSES = (R2_STATUS_NEW, R2_STATUS_UNDER_REVIEW, R2_STATUS_CONFIRMED, R2_STATUS_FALSE_POSITIVE, R2_STATUS_CLOSED)

R2_LEVEL_LOW = "LOW"
R2_LEVEL_MEDIUM = "MEDIUM"
R2_LEVEL_HIGH = "HIGH"
R2_LEVEL_CRITICAL = "CRITICAL"
R2_LEVELS = (R2_LEVEL_LOW, R2_LEVEL_MEDIUM, R2_LEVEL_HIGH, R2_LEVEL_CRITICAL)

HIGH_RISK_THRESHOLD = 60


class R2Investigation(Base):
    """One Round 2 investigation per Round 1 detection."""

    __tablename__ = "r2_investigations"
    __table_args__ = (
        UniqueConstraint("detection_id", name="uq_r2inv_detection"),
        Index("ix_r2inv_detection", "detection_id"),
        Index("ix_r2inv_brand_status", "brand_id", "status"),
        Index("ix_r2inv_brand_level", "brand_id", "risk_level"),
        Index("ix_r2inv_brand_score", "brand_id", "risk_score"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Round 1 reference — read-only pointer; the R1 row is never modified
    detection_id: Mapped[int] = mapped_column(Integer, nullable=False)
    brand_id: Mapped[int] = mapped_column(Integer, nullable=False)
    # R2 risk assessment (independent of R1 scoring)
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    risk_level: Mapped[str] = mapped_column(String(10), default="LOW")
    score_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    # Analyst workflow
    status: Mapped[str] = mapped_column(String(20), default="new")
    assigned_to: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Denormalized snapshot for fast listing (avoids a JOIN to R1 on every list request)
    platform: Mapped[str] = mapped_column(String(20), default="")
    name: Mapped[str] = mapped_column(String(200), default="")
    handle: Mapped[str | None] = mapped_column(String(200), nullable=True)
    category: Mapped[str] = mapped_column(String(10), default="")
    r1_score: Mapped[int] = mapped_column(Integer, default=0)
    r1_band: Mapped[str] = mapped_column(String(10), default="")
    # Alert flag: true once a high-risk alert has been fired for this investigation
    alerted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class R2InvestigationEvent(Base):
    """Append-only audit trail — never overwritten, never deleted."""

    __tablename__ = "r2_investigation_events"
    __table_args__ = (Index("ix_r2evt_inv", "investigation_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    investigation_id: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(40))
    from_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    actor: Mapped[str] = mapped_column(String(120), default="system")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class R2Alert(Base):
    """High-risk alert — created once per investigation, never on page refresh."""

    __tablename__ = "r2_alerts"
    __table_args__ = (Index("ix_r2alert_inv", "investigation_id"), Index("ix_r2alert_brand", "brand_id"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    investigation_id: Mapped[int] = mapped_column(Integer, nullable=False)
    detection_id: Mapped[int] = mapped_column(Integer, nullable=False)
    brand_id: Mapped[int] = mapped_column(Integer, nullable=False)
    risk_score: Mapped[int] = mapped_column(Integer)
    risk_level: Mapped[str] = mapped_column(String(10))
    platform: Mapped[str] = mapped_column(String(20), default="")
    name: Mapped[str] = mapped_column(String(200), default="")
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dismissed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
