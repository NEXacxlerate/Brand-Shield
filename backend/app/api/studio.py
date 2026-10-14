"""Brand Studio saved items (logos, palettes, names, content, audits, sentiment). Per user, owner-only; replaces Firebase `collections`.

The response mirrors the Studio's `SavedItem` type (id, userId as strings; `url` for the picture; `timestamp` in milliseconds), plus
`created_at`. Another user's item is a plain 404. Images go through the same FileStore as logos and are validated like every upload.
"""

from __future__ import annotations

import base64
import binascii
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.common import file_response
from app.config.deps import get_current_user, get_store
from app.core.pipeline.candidate_images import process_candidate_image
from app.core.pipeline.logo import LogoError
from app.core.storage import MEDIA_BY_FORMAT, FileStore
from app.db.session import get_db
from app.models import User
from app.models.studio import STUDIO_TYPES, StudioItem
from app.schemas.auth import OkResponse

router = APIRouter(prefix="/studio")

LABEL_MAX = 200
DATA_MAX_BYTES = 64 * 1024
IMAGE_MAX_BYTES = 2 * 1024 * 1024
MAX_ITEMS_PER_USER = 500
_BODY_MAX_BYTES = IMAGE_MAX_BYTES * 2 + DATA_MAX_BYTES  # base64 inflates by a third; anything bigger is refused before it is parsed


def item_out(it: StudioItem) -> dict:
    return {
        "id": str(it.id),
        "userId": str(it.user_id),
        "type": it.type,
        "label": it.label,
        "data": it.data,
        "url": f"/api/studio/items/{it.id}/image" if it.image_path else None,
        "timestamp": int(it.created_at.timestamp() * 1000),
        "created_at": it.created_at.isoformat().replace("+00:00", "Z"),
    }


def _decode_image(value: str) -> bytes:
    """Raw base64 or a `data:image/...;base64,` URL -> bytes. Size is checked before decoding."""
    if value.startswith("data:"):
        head, _, value = value.partition(",")
        if ";base64" not in head:
            raise HTTPException(422, "image_base64 must be base64 encoded")
    value = "".join(value.split())
    if len(value) > IMAGE_MAX_BYTES * 4 // 3 + 8:
        raise HTTPException(413, "Image is larger than 2 MB")
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(422, "image_base64 is not valid base64") from exc


def _clean_fields(type_: Any, label: Any, data: Any) -> tuple[str, str, Any]:
    if type_ not in STUDIO_TYPES:
        raise HTTPException(422, f"type must be one of: {', '.join(STUDIO_TYPES)}")
    label = " ".join("".join(ch for ch in str(label or "") if ch.isprintable() or ch.isspace()).split())
    if not label:
        raise HTTPException(422, "label is required")
    if len(label) > LABEL_MAX:
        raise HTTPException(422, f"label must be at most {LABEL_MAX} characters")
    if data is not None:
        try:
            size = len(json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode())
        except (TypeError, ValueError) as exc:
            raise HTTPException(422, "data must be JSON") from exc
        if size > DATA_MAX_BYTES:
            raise HTTPException(413, f"data is larger than {DATA_MAX_BYTES // 1024} KB")
    return type_, label, data


def _create(db: Session, store: FileStore, user: User, type_: Any, label: Any, data: Any, image: bytes | None) -> dict:
    type_, label, data = _clean_fields(type_, label, data)
    if (db.scalar(select(func.count()).select_from(StudioItem).where(StudioItem.user_id == user.id)) or 0) >= MAX_ITEMS_PER_USER:
        raise HTTPException(409, f"You can keep at most {MAX_ITEMS_PER_USER} saved items. Delete some first.")
    rel = None
    if image:
        try:
            img = process_candidate_image(image, IMAGE_MAX_BYTES)
        except LogoError as exc:
            raise HTTPException(exc.status_code, exc.message) from exc
        rel = f"studio/user_{user.id}/{img.sha256[:24]}.{img.format}"
        store.write_if_absent(rel, img.data, db)
    item = StudioItem(user_id=user.id, type=type_, label=label, data=data, image_path=rel)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item_out(item)


@router.get("/items")
def list_items(
    type: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if type is not None and type not in STUDIO_TYPES:
        raise HTTPException(422, f"type must be one of: {', '.join(STUDIO_TYPES)}")
    q = select(StudioItem).where(StudioItem.user_id == user.id)
    if type:
        q = q.where(StudioItem.type == type)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(StudioItem.created_at.desc(), StudioItem.id.desc()).limit(limit).offset(offset)).all()
    return {"total": total, "limit": limit, "offset": offset, "items": [item_out(r) for r in rows]}


@router.post("/items", status_code=201)
async def create_item(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    store: FileStore = Depends(get_store),
) -> dict:
    """JSON {type, label, data?, image_base64?} or multipart/form-data (type, label, data = JSON text, file = the picture)."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > _BODY_MAX_BYTES:
        raise HTTPException(413, "Request is too large")
    ctype = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    image: bytes | None = None
    if ctype == "multipart/form-data":
        form = await request.form()
        type_, label, raw = form.get("type"), form.get("label"), form.get("data")
        try:
            data = json.loads(raw) if isinstance(raw, str) and raw.strip() else None
        except ValueError as exc:
            raise HTTPException(422, "data must be JSON text") from exc
        up = form.get("file")
        if up is not None and hasattr(up, "read"):
            image = await up.read(IMAGE_MAX_BYTES + 1) or None
    elif ctype == "application/json":
        body = await request.body()
        if len(body) > _BODY_MAX_BYTES:
            raise HTTPException(413, "Request is too large")
        try:
            payload = json.loads(body or b"{}")
        except ValueError as exc:
            raise HTTPException(422, "Body must be JSON") from exc
        if not isinstance(payload, dict):
            raise HTTPException(422, "Body must be a JSON object")
        type_, label, data = payload.get("type"), payload.get("label"), payload.get("data")
        b64 = payload.get("image_base64")
        if b64 not in (None, ""):
            if not isinstance(b64, str):
                raise HTTPException(422, "image_base64 must be a string")
            image = _decode_image(b64)
    else:
        raise HTTPException(415, "Send application/json or multipart/form-data")
    return await run_in_threadpool(_create, db, store, user, type_, label, data, image)


def _mine(db: Session, item_id: str, user: User) -> StudioItem:
    it = db.get(StudioItem, int(item_id)) if item_id.isdigit() and len(item_id) < 12 else None
    if it is None or it.user_id != user.id:
        raise HTTPException(404, "Item not found")
    return it


@router.delete("/items/{item_id}", response_model=OkResponse)
def delete_item(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db), store: FileStore = Depends(get_store)) -> OkResponse:
    it = _mine(db, item_id, user)
    path = it.image_path
    db.delete(it)
    db.commit()
    if path and not db.scalar(select(StudioItem.id).where(StudioItem.image_path == path).limit(1)):  # content-addressed: another item may share it
        store.delete(path)
    return OkResponse()


@router.get("/items/{item_id}/image")
def get_item_image(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db), store: FileStore = Depends(get_store)) -> Response:
    it = _mine(db, item_id, user)
    data = store.read(it.image_path) if it.image_path else None
    if data is None:
        raise HTTPException(404, "This item has no image")
    ext = (it.image_path or "").rsplit(".", 1)[-1]
    return file_response(data, MEDIA_BY_FORMAT.get(ext, "application/octet-stream"),
                         {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300", "Content-Disposition": "inline"})
