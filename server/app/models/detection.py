from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base


class Detection(Base):
    """A suspected impersonation. A human must confirm every one (status starts as 'new')."""

    __tablename__ = "detections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(20))  # fake_profile | fake_brand_page | scam_account | fake_app
    category: Mapped[str] = mapped_column(String(10))  # social | apps
    platform: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    handle: Mapped[str | None] = mapped_column(String(200), nullable=True)
    package_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    publisher: Mapped[str | None] = mapped_column(String(200), nullable=True)
    profile_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    score: Mapped[int] = mapped_column(Integer)
    band: Mapped[str] = mapped_column(String(10))  # high | medium | low
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)
    # [{"signal": str, "detail": str, "points": int}] - every score is explainable
    reasons: Mapped[list] = mapped_column(JSON, default=list)
    # {"page_url", "captured_at", "sha256", "snapshot_path", "screenshot_path"}; sha256 = hash of the saved snapshot
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    details: Mapped[dict] = mapped_column(JSON, default=dict)  # per-type extras (followers, downloads, ...)
    stale: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(10), default="live")  # live | sample
    found_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class OfficialMatch(Base):
    """An item a scan skipped because it matched the allowlist (shown as 'Excluded as official')."""

    __tablename__ = "official_matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), index=True)
    scan_id: Mapped[int | None] = mapped_column(ForeignKey("scans.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(10))  # account | app
    platform: Mapped[str | None] = mapped_column(String(20), nullable=True)
    label: Mapped[str] = mapped_column(String(300))
    reason: Mapped[str] = mapped_column(String(40))  # exact_handle | package_id_publisher | ...
    official_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("official_accounts.id", ondelete="SET NULL"), nullable=True
    )
    official_app_id: Mapped[int | None] = mapped_column(
        ForeignKey("official_apps.id", ondelete="SET NULL"), nullable=True
    )
    source: Mapped[str] = mapped_column(String(10), default="live")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
