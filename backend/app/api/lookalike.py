from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.common import mode_of, owns_brand, resolve_brand
from app.config.config import Settings
from app.config.deps import get_current_user, get_settings_dep, get_store, require_admin, require_writer
from app.core.pipeline import logo_compare, lookalike
from app.core.pipeline.logo import LogoError
from app.core.storage import FileStore
from app.db.session import get_db
from app.models import LookalikeCase, User
from app.services import audit

router = APIRouter(prefix="/lookalike")


def clean_name(v: str) -> str:
    """Collapse whitespace and drop control characters."""
    return " ".join("".join(ch for ch in v if ch.isprintable() or ch.isspace()).split())


class TestBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    brand_id: int | None = None
    platform: str | None = None

    @field_validator("name")
    @classmethod
    def _clean(cls, v: str) -> str:
        v = clean_name(v)
        if not v:
            raise ValueError("Type a name to test")
        return v


class UrlBody(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    brand_id: int | None = None

    @field_validator("url")
    @classmethod
    def _clean(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Type a domain or URL to test")
        return v


class CaseBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    expected: Literal["flagged", "not_flagged", "official"]

    @field_validator("name")
    @classmethod
    def _clean(cls, v: str) -> str:
        v = clean_name(v)
        if not v:
            raise ValueError("Name is required")
        return v


def _case(c: LookalikeCase) -> dict:
    return {"id": c.id, "name": c.name, "expected": c.expected, "builtin": c.builtin, "source": c.source}


@router.post("/test")
def test_name(body: TestBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Runs the live matcher with the Settings rules. Pure: no side effects, safe to call on every keystroke."""
    brand = resolve_brand(db, body.brand_id, user)
    return lookalike.evaluate_name(db, brand, body.name, body.platform)


@router.post("/test-url")
def test_url(body: UrlBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Compare a typed domain / URL with the brand's official domains. Never opens it, no network, no reputation check."""
    return lookalike.evaluate_url(db, resolve_brand(db, body.brand_id, user), body.url)


@router.post("/test-logo")
def test_logo(
    request: Request,
    file: UploadFile = File(...),
    reference: UploadFile | None = File(None),
    brand_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    store: FileStore = Depends(get_store),
) -> dict:
    """Compare an uploaded logo with every official logo (or one manually supplied reference). Nothing is stored; no score or detection is created."""
    brand = resolve_brand(db, brand_id, user)
    cap = settings.logo_max_bytes
    ref_data = b""
    try:
        cand = logo_compare.read_image(file.file.read(cap + 1), cap, "logo")
        if reference is not None and reference.filename:
            ref_data = reference.file.read(cap + 1)
        if ref_data:
            refs = [("manual", "Manual reference", logo_compare.read_image(ref_data, cap, "reference logo"))]
        else:
            refs = logo_compare.official_logos(store, brand)
    except LogoError as exc:
        raise HTTPException(exc.status_code, exc.message) from exc
    if not refs:
        raise HTTPException(422, logo_compare.NO_LOGO)
    return logo_compare.compare(settings, cand, refs, bool(ref_data), mode_of(db, request) == "sample")


@router.get("/logo-engine")
def logo_engine(_: User = Depends(get_current_user), settings: Settings = Depends(get_settings_dep)) -> dict:
    """Is the AI (CLIP) logo engine usable? No model load and no network: it only checks the package and the weights on disk."""
    return logo_compare.clip_status(settings)


@router.get("/test-urls")
def url_examples(brand_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    brand = resolve_brand(db, brand_id, user)
    return lookalike.domain_examples(brand.name, list(brand.domains or []))


@router.get("/test-cases")
def list_cases(brand_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    brand = resolve_brand(db, brand_id, user)
    lookalike.ensure_default_cases(db, brand)
    items = [_case(c) for c in db.scalars(select(LookalikeCase).where(LookalikeCase.brand_id == brand.id).order_by(LookalikeCase.id))]
    return {"total": len(items), "items": items}


@router.post("/test-cases", status_code=201)
def add_case(body: CaseBody, brand_id: int | None = None, user: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    brand = resolve_brand(db, brand_id, user)
    lookalike.ensure_default_cases(db, brand)
    if db.scalar(select(LookalikeCase.id).where(LookalikeCase.brand_id == brand.id, LookalikeCase.name == body.name, LookalikeCase.expected == body.expected)):
        raise HTTPException(409, "This test case already exists")
    case = LookalikeCase(brand_id=brand.id, name=body.name, expected=body.expected, builtin=False, created_by=user.id)
    db.add(case)
    db.flush()
    audit.record(db, user, "lookalike.case_added", body.name, f"expected {body.expected}")
    db.commit()
    return _case(case)


@router.delete("/test-cases/{case_id}")
def delete_case(case_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    case = db.get(LookalikeCase, case_id)
    if case is None or not owns_brand(db, case.brand_id, user):
        raise HTTPException(404, "Test case not found")
    audit.record(db, user, "lookalike.case_removed", case.name, f"expected {case.expected}")
    db.delete(case)
    db.commit()
    return {"ok": True}


@router.post("/test-cases/run")
def run_cases(brand_id: int | None = None, user: User = Depends(require_writer), db: Session = Depends(get_db)) -> dict:
    brand = resolve_brand(db, brand_id, user)
    result = lookalike.run_cases(db, brand)
    audit.record(db, user, "lookalike.cases_run", brand.name, result["summary"])
    db.commit()
    return result
