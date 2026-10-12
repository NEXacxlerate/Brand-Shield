"""Evidence storage with a chain of custody. Files live outside the web root and are served only through the download endpoint."""
import hashlib
import json
import re
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Custody, Evidence, User, utcnow


class UploadError(ValueError):
    pass


def detect_mime(data: bytes) -> str | None:
    """Magic-byte check. The client-supplied content type and file extension are ignored."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:5] == b"%PDF-":
        return "application/pdf"
    if data[:4] == b"PK\x03\x04":
        return "application/zip"
    head = data[:4096]
    if b"\x00" not in head:
        try:
            head.decode("utf-8")
        except UnicodeDecodeError:
            return None
        stripped = data[:200].lstrip()
        if stripped[:1] in (b"{", b"["):
            return "application/json"
        if re.match(rb"(?is)<!doctype html|<html", stripped):
            return "text/html"
        return "text/plain"
    return None


def safe_name(name: str) -> str:
    name = Path((name or "file").replace("\\", "/")).name
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip(" .") or "file"
    return name[:120]


def store(db: Session, user: User, data: bytes, filename: str, kind: str = "file", investigation_id: str | None = None,
          campaign_id: int | None = None, entity_id: int | None = None, source: str = "user") -> Evidence:
    if not data:
        raise UploadError("The file is empty")
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise UploadError(f"File is larger than {settings.max_upload_mb} MB")
    mime = detect_mime(data)
    if not mime:
        raise UploadError("Unsupported file type (allowed: images, PDF, ZIP/APK, text, JSON, HTML)")
    sha = hashlib.sha256(data).hexdigest()
    path = settings.evidence_dir / f"{sha[:16]}_{uuid.uuid4().hex[:8]}.bin"
    path.write_bytes(data)
    ev = Evidence(investigation_id=investigation_id, campaign_id=campaign_id, entity_id=entity_id, kind=kind[:32], filename=safe_name(filename),
                  path=str(path), sha256=sha, size=len(data), mime=mime, source=source, captured_by=user.id)
    db.add(ev)
    db.flush()
    db.add(Custody(evidence_id=ev.id, action="captured", actor=user.name))
    db.add(Custody(evidence_id=ev.id, action="hashed", actor="system"))
    if investigation_id or campaign_id or entity_id:
        db.add(Custody(evidence_id=ev.id, action="attached", actor=user.name))
    db.commit()
    return ev


def record_download(db: Session, ev: Evidence, user: User):
    db.add(Custody(evidence_id=ev.id, action="downloaded", actor=user.name))
    db.commit()


def custody_of(db: Session, evidence_id: int) -> list[dict]:
    return [{"action": c.action, "actor": c.actor, "at": c.at.isoformat() + "Z"}
            for c in db.scalars(select(Custody).where(Custody.evidence_id == evidence_id).order_by(Custody.id))]


def verify_integrity(ev: Evidence) -> bool:
    try:
        return hashlib.sha256(Path(ev.path).read_bytes()).hexdigest() == ev.sha256
    except OSError:
        return False


def to_dict(db: Session, ev: Evidence) -> dict:
    return {"id": ev.id, "investigation_id": ev.investigation_id, "campaign_id": ev.campaign_id, "entity_id": ev.entity_id, "kind": ev.kind,
            "filename": ev.filename, "sha256": ev.sha256, "size": ev.size, "mime": ev.mime, "source": ev.source,
            "captured_at": ev.captured_at.isoformat() + "Z", "custody": custody_of(db, ev.id)}


def dumps(o) -> str:
    return json.dumps(o, ensure_ascii=False, default=str)
