"""Round 2 investigation tables — independent of all Round 1 tables.

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-24

Adds three new tables:
  r2_investigations       — one R2 record per R1 detection (unique on detection_id)
  r2_investigation_events — append-only audit trail per investigation
  r2_alerts               — high-risk alerts (created once per investigation)

No existing table is modified.
"""
import sqlalchemy as sa
from alembic import op

revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'r2_investigations',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('detection_id', sa.Integer, nullable=False),
        sa.Column('brand_id', sa.Integer, nullable=False),
        sa.Column('risk_score', sa.Integer, nullable=False, server_default='0'),
        sa.Column('risk_level', sa.String(10), nullable=False, server_default='LOW'),
        sa.Column('score_breakdown', sa.JSON, nullable=False, server_default='{}'),
        sa.Column('status', sa.String(20), nullable=False, server_default='new'),
        sa.Column('assigned_to', sa.String(120), nullable=True),
        sa.Column('platform', sa.String(20), nullable=False, server_default=''),
        sa.Column('name', sa.String(200), nullable=False, server_default=''),
        sa.Column('handle', sa.String(200), nullable=True),
        sa.Column('category', sa.String(10), nullable=False, server_default=''),
        sa.Column('r1_score', sa.Integer, nullable=False, server_default='0'),
        sa.Column('r1_band', sa.String(10), nullable=False, server_default=''),
        sa.Column('alerted', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('detection_id', name='uq_r2inv_detection'),
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_r2inv_detection ON r2_investigations (detection_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_r2inv_brand_status ON r2_investigations (brand_id, status)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_r2inv_brand_level ON r2_investigations (brand_id, risk_level)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_r2inv_brand_score ON r2_investigations (brand_id, risk_score)"))

    op.create_table(
        'r2_investigation_events',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('investigation_id', sa.Integer, nullable=False),
        sa.Column('action', sa.String(40), nullable=False),
        sa.Column('from_status', sa.String(20), nullable=True),
        sa.Column('to_status', sa.String(20), nullable=True),
        sa.Column('actor', sa.String(120), nullable=False, server_default='system'),
        sa.Column('note', sa.Text, nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_r2evt_inv ON r2_investigation_events (investigation_id)"))

    op.create_table(
        'r2_alerts',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('investigation_id', sa.Integer, nullable=False),
        sa.Column('detection_id', sa.Integer, nullable=False),
        sa.Column('brand_id', sa.Integer, nullable=False),
        sa.Column('risk_score', sa.Integer, nullable=False),
        sa.Column('risk_level', sa.String(10), nullable=False),
        sa.Column('platform', sa.String(20), nullable=False, server_default=''),
        sa.Column('name', sa.String(200), nullable=False, server_default=''),
        sa.Column('dismissed', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('dismissed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('dismissed_by', sa.String(120), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_r2alert_inv ON r2_alerts (investigation_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_r2alert_brand ON r2_alerts (brand_id)"))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_r2alert_brand"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_r2alert_inv"))
    op.drop_table('r2_alerts')

    op.execute(sa.text("DROP INDEX IF EXISTS ix_r2evt_inv"))
    op.drop_table('r2_investigation_events')

    op.execute(sa.text("DROP INDEX IF EXISTS ix_r2inv_brand_score"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_r2inv_brand_level"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_r2inv_brand_status"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_r2inv_detection"))
    op.drop_table('r2_investigations')
