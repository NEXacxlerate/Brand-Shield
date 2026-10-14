from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.config.time import utcnow
from app.db.base import Base

STUDIO_TYPES = ("logo", "palette", "brand_name", "content", "audit", "sentiment")


class StudioItem(Base):
    """An item saved in Brand Studio (logo, palette, brand name, content, audit, sentiment). Owned by one user, never shared."""

    __tablename__ = "studio_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(20))  # logo | palette | brand_name | content | audit | sentiment
    label: Mapped[str] = mapped_column(String(200), default="")
    data: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    image_path: Mapped[str | None] = mapped_column(String(300), nullable=True)  # relative path in the FileStore
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
