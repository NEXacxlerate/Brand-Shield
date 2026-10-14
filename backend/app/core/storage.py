"""File storage for uploaded logos, candidate images and evidence snapshots.

Two interchangeable stores behind one small interface (paths are always RELATIVE, posix style, e.g. "logos/brand_1/abc.png"):

* LocalFileStore(data_dir)      files under DATA_DIR. The default and the original behaviour.
* DatabaseFileStore(sessions)   rows of the `stored_files` table. For serverless hosting (Vercel) where the file system is read-only
                                and not shared between function instances. STORAGE_BACKEND=database (the default on Vercel).

Both refuse any path that could leave the store (absolute paths, "..", backslashes, NUL bytes).
"""

from __future__ import annotations

import mimetypes
from pathlib import Path, PurePosixPath
from typing import Protocol, runtime_checkable

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.config.time import utcnow

MAX_PATH_LEN = 300  # stored_files.path


@runtime_checkable
class FileStore(Protocol):
    def write(self, rel_path: str, data: bytes, db: Session | None = None) -> None:
        """Store `data` at `rel_path`. `db` is the caller's open session: the database store then joins ITS transaction (no commit of its
        own) instead of opening a second connection, which would deadlock on SQLite and splits the unit of work on PostgreSQL."""
        ...

    def write_if_absent(self, rel_path: str, data: bytes, db: Session | None = None) -> None:
        """Content-addressed files: store `data` unless the path is already there."""
        ...

    def read(self, rel_path: str | None) -> bytes | None: ...

    def exists(self, rel_path: str | None) -> bool: ...

    def delete(self, rel_path: str | None) -> None: ...


def clean_rel_path(rel: str | None) -> str | None:
    """Normalised relative posix path, or None when it is empty or tries to escape the store."""
    if not rel or "\x00" in rel or "\\" in rel or len(rel) > MAX_PATH_LEN:
        return None
    p = PurePosixPath(rel)
    if p.is_absolute() or not p.parts or any(part in ("..", ".", "") for part in p.parts) or (p.parts[0].endswith(":")):
        return None
    return p.as_posix()


class LocalFileStore:
    def __init__(self, data_dir: Path) -> None:
        self.root = Path(data_dir)

    def _safe(self, rel: str | None) -> Path | None:
        if clean_rel_path(rel) is None:
            return None
        root = self.root.resolve()
        path = (root / str(rel)).resolve()
        return path if root in path.parents else None

    def write(self, rel_path: str, data: bytes, db: Session | None = None) -> None:
        path = self._safe(rel_path)
        if path is None:
            raise ValueError(f"unsafe storage path: {rel_path!r}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def write_if_absent(self, rel_path: str, data: bytes, db: Session | None = None) -> None:
        if not self.exists(rel_path):
            self.write(rel_path, data, db)

    def read(self, rel_path: str | None) -> bytes | None:
        path = self._safe(rel_path)
        if path is None or not path.is_file():
            return None
        try:
            return path.read_bytes()
        except OSError:
            return None

    def exists(self, rel_path: str | None) -> bool:
        path = self._safe(rel_path)
        return path is not None and path.is_file()

    def delete(self, rel_path: str | None) -> None:
        path = self._safe(rel_path)
        if path is not None:
            path.unlink(missing_ok=True)


class DatabaseFileStore:
    """Each call uses its own short session, so a file write never joins (or commits) the caller's open transaction."""

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self.session_factory = session_factory

    def write(self, rel_path: str, data: bytes, db: Session | None = None) -> None:
        from app.models import StoredFile

        rel = clean_rel_path(rel_path)
        if rel is None:
            raise ValueError(f"unsafe storage path: {rel_path!r}")
        ctype = mimetypes.guess_type(rel)[0] or "application/octet-stream"
        if db is not None:  # joins the caller's transaction; the caller commits
            row = db.get(StoredFile, rel)
            if row is None:
                db.add(StoredFile(path=rel, content=data, content_type=ctype, size_bytes=len(data), created_at=utcnow()))
            else:
                row.content, row.content_type, row.size_bytes = data, ctype, len(data)
            db.flush()
            return
        for _ in range(2):
            with self.session_factory() as db:
                row = db.get(StoredFile, rel)
                if row is None:
                    db.add(StoredFile(path=rel, content=data, content_type=ctype, size_bytes=len(data), created_at=utcnow()))
                else:
                    row.content, row.content_type, row.size_bytes = data, ctype, len(data)
                try:
                    db.commit()
                    return
                except IntegrityError:  # another instance inserted the same path first: retry as an update
                    db.rollback()
        raise RuntimeError(f"could not store {rel}")

    def write_if_absent(self, rel_path: str, data: bytes, db: Session | None = None) -> None:
        from app.models import StoredFile

        if db is not None:  # one lookup inside the caller's transaction (a second session would end it on a shared connection)
            if db.get(StoredFile, clean_rel_path(rel_path) or "") is None:
                self.write(rel_path, data, db)
        elif not self.exists(rel_path):
            self.write(rel_path, data)

    def read(self, rel_path: str | None) -> bytes | None:
        from app.models import StoredFile

        rel = clean_rel_path(rel_path)
        if rel is None:
            return None
        with self.session_factory() as db:
            return db.scalar(select(StoredFile.content).where(StoredFile.path == rel))

    def exists(self, rel_path: str | None) -> bool:
        from app.models import StoredFile

        rel = clean_rel_path(rel_path)
        if rel is None:
            return False
        with self.session_factory() as db:
            return db.scalar(select(StoredFile.path).where(StoredFile.path == rel)) is not None

    def delete(self, rel_path: str | None) -> None:
        from app.models import StoredFile

        rel = clean_rel_path(rel_path)
        if rel is None:
            return
        with self.session_factory() as db:
            db.execute(delete(StoredFile).where(StoredFile.path == rel))
            db.commit()


def build_store(settings, session_factory: sessionmaker[Session]) -> FileStore:
    """The store chosen by STORAGE_BACKEND (local | database)."""
    backend = (settings.storage_backend or "local").lower()
    if backend == "database":
        return DatabaseFileStore(session_factory)
    if backend != "local":
        raise ValueError(f"STORAGE_BACKEND must be 'local' or 'database', got {settings.storage_backend!r}")
    return LocalFileStore(settings.data_dir)


MEDIA_BY_FORMAT = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}
