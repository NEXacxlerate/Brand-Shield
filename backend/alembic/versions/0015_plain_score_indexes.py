"""Recreate the two detection score indexes without DESC so every database (SQLite and PostgreSQL) matches the models exactly.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-25

A B-tree index is read in either direction, so dropping DESC changes nothing for the list queries. No table data is touched.
"""
import sqlalchemy as sa
from alembic import op

revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_det_brand_cat_status_score"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_det_brand_status_score"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_det_brand_cat_status_score ON detections (brand_id, category, status, score)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_det_brand_status_score ON detections (brand_id, status, score)"))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_det_brand_cat_status_score"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_det_brand_status_score"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_det_brand_cat_status_score ON detections (brand_id, category, status, score DESC)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_det_brand_status_score ON detections (brand_id, status, score DESC)"))
