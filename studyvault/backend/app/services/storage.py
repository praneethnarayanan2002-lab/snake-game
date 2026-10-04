"""Pluggable file storage.

PDF binaries never touch PostgreSQL: the database only stores the opaque ``file_key``
returned by a backend. To move to Supabase Storage / S3 / Cloudinary, implement
``StorageBackend`` and register it in ``_BACKENDS``.
"""

import shutil
import uuid
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO

from app.config import get_settings


class StorageBackend(ABC):
    @abstractmethod
    def save(self, fileobj: BinaryIO, filename: str) -> str:
        """Persist the stream and return a backend-specific key."""

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    def local_path(self, key: str) -> Path | None:
        """Filesystem path for direct streaming, or None for remote backends."""
        return None

    def public_url(self, key: str) -> str | None:
        """Direct URL (e.g. a signed S3 URL) when the backend can serve files itself."""
        return None

    @staticmethod
    def new_key(filename: str) -> str:
        suffix = Path(filename).suffix.lower() or ".pdf"
        now = datetime.now(UTC)
        return f"{now:%Y/%m}/{uuid.uuid4().hex}{suffix}"


class LocalDiskStorage(StorageBackend):
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Invalid storage key")
        return path

    def save(self, fileobj: BinaryIO, filename: str) -> str:
        key = self.new_key(filename)
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as out:
            shutil.copyfileobj(fileobj, out)
        return key

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def local_path(self, key: str) -> Path | None:
        return self._path(key)


_BACKENDS = {"local": lambda s: LocalDiskStorage(s.storage_dir)}
_instance: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _instance
    if _instance is None:
        settings = get_settings()
        try:
            _instance = _BACKENDS[settings.storage_backend](settings)
        except KeyError as exc:
            raise RuntimeError(f"Unknown storage backend {settings.storage_backend!r}") from exc
    return _instance


def set_storage(backend: StorageBackend | None) -> None:
    global _instance
    _instance = backend
