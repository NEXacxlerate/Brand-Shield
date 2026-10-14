"""studio_items: items saved in Brand Studio (replaces Firebase collections)

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-17 12:00:00.000000

Additive. On PostgreSQL the table also gets ROW LEVEL SECURITY enabled with no policy (same reason as stored_files in 0009): the Supabase
REST roles must not read saved items; the backend connects as the table owner, which is not subject to RLS.
"""
from alembic import op
import sqlalchemy as sa


revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('studio_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(length=20), nullable=False),
        sa.Column('label', sa.String(length=200), nullable=False),
        sa.Column('data', sa.JSON(), nullable=True),
        sa.Column('image_path', sa.String(length=300), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_studio_items_user_id_users'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_studio_items')),
    )
    op.create_index(op.f('ix_studio_items_user_id'), 'studio_items', ['user_id'], unique=False)
    if op.get_bind().dialect.name == 'postgresql':
        op.execute('ALTER TABLE studio_items ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_index(op.f('ix_studio_items_user_id'), table_name='studio_items')
    op.drop_table('studio_items')
