from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.db.base import Base


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    industry: Mapped[str] = mapped_column(String(120), default="")
    aliases: Mapped[list] = mapped_column(JSON, default=list)
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    domains: Mapped[list] = mapped_column(JSON, default=list)
    logo_path: Mapped[str | None] = mapped_column(String(300), nullable=True)  # relative to data dir
    logo_format: Mapped[str | None] = mapped_column(String(10), nullable=True)
    logo_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    logo_height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    logo_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    logo_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source: Mapped[str] = mapped_column(String(10), default="live")  # live | sample
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    accounts: Mapped[list["OfficialAccount"]] = relationship(
        back_populates="brand", cascade="all, delete-orphan", order_by="OfficialAccount.id"
    )
    apps: Mapped[list["OfficialApp"]] = relationship(
        back_populates="brand", cascade="all, delete-orphan", order_by="OfficialApp.id"
    )


class OfficialAccount(Base):
    __tablename__ = "official_accounts"
    __table_args__ = (UniqueConstraint("brand_id", "platform", "handle_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(20))
    handle: Mapped[str] = mapped_column(String(30))  # bare handle, no leading @
    handle_key: Mapped[str] = mapped_column(String(30))  # lower-case, used for duplicate detection
    url: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default="unreachable")  # verified | unreachable
    check_message: Mapped[str | None] = mapped_column(String(300), nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str] = mapped_column(String(10), default="live")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    brand: Mapped[Brand] = relationship(back_populates="accounts")


class OfficialApp(Base):
    __tablename__ = "official_apps"
    __table_args__ = (UniqueConstraint("brand_id", "package_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    package_id: Mapped[str] = mapped_column(String(155))
    package_key: Mapped[str] = mapped_column(String(155))  # lower-case duplicate key
    publisher: Mapped[str] = mapped_column(String(120))
    store_id: Mapped[str | None] = mapped_column(String(20), nullable=True)  # optional numeric App Store id (.../id123456789)
    stores: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="verified")
    source: Mapped[str] = mapped_column(String(10), default="live")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    brand: Mapped[Brand] = relationship(back_populates="apps")
