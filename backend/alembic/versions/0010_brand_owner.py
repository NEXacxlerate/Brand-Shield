"""brands.owner_id and lookalike_cases.brand_id: one workspace per account

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-17 09:00:00.000000

Every brand now belongs to the user that created it. Existing brands are given to the first admin (lowest id), and every existing
look-alike case to the first brand, so nothing is lost. Both columns stay nullable (a brand whose owner was deleted keeps its rows).
The unique index on built-in case names is per brand now. No new tables, so nothing to do for row level security.
"""
from alembic import op
import sqlalchemy as sa


revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def _fk_pragma(on: bool) -> None:
    """SQLite only. Rebuilding `brands` (batch mode) drops the old table, and with foreign keys ON that cascades into every table that
    references it (scans, detections, accounts ...). The pragma is ignored inside a transaction, hence the autocommit block."""
    if op.get_bind().dialect.name == 'sqlite':
        with op.get_context().autocommit_block():
            op.execute('PRAGMA foreign_keys=' + ('ON' if on else 'OFF'))


def upgrade() -> None:
    _fk_pragma(False)
    try:
        with op.batch_alter_table('brands') as batch:
            batch.add_column(sa.Column('owner_id', sa.Integer(), nullable=True))
            batch.create_foreign_key(op.f('fk_brands_owner_id_users'), 'users', ['owner_id'], ['id'], ondelete='SET NULL')
            batch.create_index(op.f('ix_brands_owner_id'), ['owner_id'], unique=False)
    finally:
        _fk_pragma(True)
    op.drop_index('uq_lookalike_cases_builtin_name', table_name='lookalike_cases')
    with op.batch_alter_table('lookalike_cases') as batch:  # nothing references lookalike_cases
        batch.add_column(sa.Column('brand_id', sa.Integer(), nullable=True))
        batch.create_foreign_key(op.f('fk_lookalike_cases_brand_id_brands'), 'brands', ['brand_id'], ['id'], ondelete='CASCADE')
        batch.create_index(op.f('ix_lookalike_cases_brand_id'), ['brand_id'], unique=False)
    op.execute(
        "UPDATE brands SET owner_id = (SELECT MIN(id) FROM users WHERE role = 'admin') WHERE owner_id IS NULL"
    )
    op.execute(
        "UPDATE lookalike_cases SET brand_id = (SELECT MIN(id) FROM brands) WHERE brand_id IS NULL"
    )
    op.create_index(
        'uq_lookalike_cases_builtin_name', 'lookalike_cases', ['brand_id', 'name'], unique=True,
        sqlite_where=sa.text('builtin'), postgresql_where=sa.text('builtin'),
    )


def downgrade() -> None:
    op.drop_index('uq_lookalike_cases_builtin_name', table_name='lookalike_cases')
    # Several brands may now each hold the same built-in names: keep the oldest row of each name so the old unique index can return.
    op.execute(
        sa.text(
            "DELETE FROM lookalike_cases WHERE builtin = :t AND id NOT IN "
            "(SELECT MIN(id) FROM lookalike_cases WHERE builtin = :t GROUP BY name)"
        ).bindparams(sa.bindparam('t', True, type_=sa.Boolean()))
    )
    with op.batch_alter_table('lookalike_cases') as batch:
        batch.drop_index(op.f('ix_lookalike_cases_brand_id'))
        batch.drop_constraint(op.f('fk_lookalike_cases_brand_id_brands'), type_='foreignkey')
        batch.drop_column('brand_id')
    op.create_index(
        'uq_lookalike_cases_builtin_name', 'lookalike_cases', ['name'], unique=True,
        sqlite_where=sa.text('builtin'), postgresql_where=sa.text('builtin'),
    )
    _fk_pragma(False)
    try:
        with op.batch_alter_table('brands') as batch:
            batch.drop_index(op.f('ix_brands_owner_id'))
            batch.drop_constraint(op.f('fk_brands_owner_id_users'), type_='foreignkey')
            batch.drop_column('owner_id')
    finally:
        _fk_pragma(True)
