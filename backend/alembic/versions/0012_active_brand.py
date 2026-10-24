"""users.active_brand_id: which of an account's brands it is working on (an account may now own several)

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-20 12:00:00.000000

Additive and nullable; no foreign key on purpose (the value is re-validated against the owner on every read).
"""
from alembic import op
import sqlalchemy as sa


revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('active_brand_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'active_brand_id')
