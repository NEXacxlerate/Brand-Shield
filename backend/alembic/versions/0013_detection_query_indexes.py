"""Detection list query indexes for brand+category+status and sort columns.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-24

The social and app monitoring pages filter by (brand_id, category, status) and sort by score or
found_at.  Without a covering index SQLite/Postgres must do a full table scan per request.
This migration adds:
  - ix_det_brand_cat_status_score  (brand_id, category, status, score DESC)  -- main list query
  - ix_det_brand_status_score      (brand_id, status, score DESC)             -- investigations page
  - ix_det_brand_found             (brand_id, found_at)                       -- date sort
  - ix_det_brand_last_seen         (brand_id, last_seen_at)                   -- last-seen sort
"""
import sqlalchemy as sa
from alembic import op

revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Raw SQL so the DESC expression and the IF NOT EXISTS guard work on both SQLite and PostgreSQL.
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_det_brand_cat_status_score "
        "ON detections (brand_id, category, status, score DESC)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_det_brand_status_score "
        "ON detections (brand_id, status, score DESC)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_det_brand_found "
        "ON detections (brand_id, found_at)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_det_brand_last_seen "
        "ON detections (brand_id, last_seen_at)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_det_brand_last_seen"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_det_brand_found"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_det_brand_status_score"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_det_brand_cat_status_score"))
