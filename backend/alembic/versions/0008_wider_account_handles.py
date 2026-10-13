"""official_accounts.handle / handle_key up to 100 characters

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-15 12:00:00.000000

LinkedIn company slugs may be up to 100 characters (hyphens allowed). SQLite does not enforce VARCHAR length, so this only showed up on PostgreSQL.
"""
from alembic import op
import sqlalchemy as sa


revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('official_accounts') as batch:
        batch.alter_column('handle', existing_type=sa.String(30), type_=sa.String(100), existing_nullable=False)
        batch.alter_column('handle_key', existing_type=sa.String(30), type_=sa.String(100), existing_nullable=False)


def downgrade() -> None:
    with op.batch_alter_table('official_accounts') as batch:
        batch.alter_column('handle_key', existing_type=sa.String(100), type_=sa.String(30), existing_nullable=False)
        batch.alter_column('handle', existing_type=sa.String(100), type_=sa.String(30), existing_nullable=False)
