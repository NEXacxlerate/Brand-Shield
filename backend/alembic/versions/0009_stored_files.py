"""stored_files: file content in the database (STORAGE_BACKEND=database, used on Vercel)

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-16 09:00:00.000000

Additive. On PostgreSQL the table also gets ROW LEVEL SECURITY enabled with no policy: Supabase exposes the public schema through
its REST API, and the API roles (anon, authenticated) must not be able to read uploaded files. The backend connects as the table
owner / postgres role, which is not subject to RLS.
"""
from alembic import op
import sqlalchemy as sa


revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('stored_files',
        sa.Column('path', sa.String(length=300), nullable=False),
        sa.Column('content', sa.LargeBinary(), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('path', name=op.f('pk_stored_files')),
    )
    if op.get_bind().dialect.name == 'postgresql':
        op.execute('ALTER TABLE stored_files ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_table('stored_files')
