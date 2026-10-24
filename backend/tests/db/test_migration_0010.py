"""Migrations 0010 (brand owner, per-brand look-alike cases) and 0011 (studio_items) on SQLite: back-fill, no data loss, clean downgrade."""

from __future__ import annotations

from sqlalchemy import inspect, text

from alembic import command
from app.db.session import make_engine
from tests.db.test_migration import _cfg
from tests.db.test_migration_0004 import _fill_row


def _seed_0009(url: str) -> None:
    cfg = _cfg(url)
    command.upgrade(cfg, "0009")
    eng = make_engine(url)
    with eng.begin() as c:
        _fill_row(c, "users", id=1, name="Viewer First", email="v@example.com", role="viewer")
        _fill_row(c, "users", id=2, name="Admin Two", email="a2@example.com", role="admin")
        _fill_row(c, "users", id=3, name="Admin Three", email="a3@example.com", role="admin")
        _fill_row(c, "brands", id=1, name="Old Brand")
        _fill_row(c, "brands", id=2, name="Archived Brand")
        _fill_row(c, "official_accounts", brand_id=1, platform="instagram", handle="old", handle_key="old", url="x")
        _fill_row(c, "scans", brand_id=1, job_id="j1", state="completed")
        _fill_row(c, "detections", brand_id=1, canonical_key="instagram:evil", platform="instagram", type="social")
        _fill_row(c, "lookalike_cases", name="old bank", expected="flagged", builtin=1)
        _fill_row(c, "lookalike_cases", name="custom", expected="official", builtin=0)


def test_upgrade_backfills_owner_and_cases_and_keeps_every_child_row(tmp_path):
    url = f"sqlite:///{(tmp_path / 'm10.db').as_posix()}"
    _seed_0009(url)
    command.upgrade(_cfg(url), "head")
    eng = make_engine(url)
    with eng.connect() as c:
        assert dict(c.execute(text("SELECT id, owner_id FROM brands")).fetchall()) == {1: 2, 2: 2}  # the first ADMIN (not the first user)
        assert set(c.execute(text("SELECT brand_id FROM lookalike_cases")).scalars()) == {1}
        # rebuilding `brands` on SQLite must not cascade-delete what references it
        assert c.execute(text("SELECT count(*) FROM official_accounts")).scalar() == 1
        assert c.execute(text("SELECT count(*) FROM scans")).scalar() == 1
        assert c.execute(text("SELECT count(*) FROM detections")).scalar() == 1
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0014"
        assert c.execute(text("PRAGMA foreign_keys")).scalar() == 1  # and the safety switch is back on afterwards
    insp = inspect(eng)
    assert "studio_items" in insp.get_table_names()
    assert {i["name"] for i in insp.get_indexes("studio_items")} >= {"ix_studio_items_user_id"}
    assert {i["name"] for i in insp.get_indexes("brands")} >= {"ix_brands_owner_id"}
    cases = {i["name"]: i for i in insp.get_indexes("lookalike_cases")}
    assert cases["uq_lookalike_cases_builtin_name"]["column_names"] == ["brand_id", "name"] and cases["uq_lookalike_cases_builtin_name"]["unique"]
    fks = {(f["constrained_columns"][0], f["referred_table"]) for f in insp.get_foreign_keys("brands")}
    assert ("owner_id", "users") in fks
    assert ("brand_id", "brands") in {(f["constrained_columns"][0], f["referred_table"]) for f in insp.get_foreign_keys("lookalike_cases")}


def test_upgrade_with_no_admin_or_no_brand_leaves_nulls(tmp_path):
    url = f"sqlite:///{(tmp_path / 'm10b.db').as_posix()}"
    command.upgrade(_cfg(url), "0009")
    eng = make_engine(url)
    with eng.begin() as c:
        _fill_row(c, "users", id=1, name="V", email="v@example.com", role="viewer")
        _fill_row(c, "brands", id=1, name="Orphan")
        _fill_row(c, "lookalike_cases", name="x", expected="flagged", builtin=1)
    command.upgrade(_cfg(url), "head")
    with eng.connect() as c:
        assert c.execute(text("SELECT owner_id FROM brands")).scalar() is None  # nobody to give it to: stays unowned (nobody can open it)
        assert c.execute(text("SELECT brand_id FROM lookalike_cases")).scalar() == 1


def test_downgrade_steps_back_without_losing_brands(tmp_path):
    url = f"sqlite:///{(tmp_path / 'm10c.db').as_posix()}"
    _seed_0009(url)
    cfg = _cfg(url)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "0009")
    eng = make_engine(url)
    with eng.connect() as c:
        assert c.execute(text("SELECT count(*) FROM brands")).scalar() == 2
        assert c.execute(text("SELECT count(*) FROM scans")).scalar() == 1
        assert c.execute(text("SELECT count(*) FROM official_accounts")).scalar() == 1
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0009"
    insp = inspect(eng)
    assert "studio_items" not in insp.get_table_names()
    assert "owner_id" not in {col["name"] for col in insp.get_columns("brands")}
    assert "brand_id" not in {col["name"] for col in insp.get_columns("lookalike_cases")}
    command.upgrade(cfg, "head")  # and it can go forward again
    with eng.connect() as c:
        assert c.execute(text("SELECT count(*) FROM scans")).scalar() == 1
