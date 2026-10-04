"""Pluggable file storage.

File binaries never touch PostgreSQL: the database only stores the opaque ``file_key``
returned by a backend. Backends: ``local`` (disk, dev) and ``supabase`` (Supabase
Storage, production). Others (S3, Cloudinary) only need to implement ``StorageBackend``
and register in ``_BACKENDS``.
"""

import shutil
import uuid
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO
from urllib.parse import quote

import httpx

from app.config import Settings, get_settings
from app.services.documents import ALLOWED_MIME_TYPES


class StorageError(RuntimeError):
    pass


class StorageBackend(ABC):
    #: True when browsers can upload straight to the backend (bypassing the API's
    #: request-size limit, e.g. 4.5 MB on Vercel functions).
    supports_direct_upload = False

    @abstractmethod
    def save(self, fileobj: BinaryIO, filename: str, content_type: str = "application/octet-stream") -> str:
        """Persist the stream and return a backend-specific key."""

    @abstractmethod
    def read(self, key: str) -> bytes: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    def local_path(self, key: str) -> Path | None:
        """Filesystem path for direct streaming, or None for remote backends."""
        return None

    def public_url(self, key: str, download_name: str | None = None) -> str | None:
        """Direct URL when the backend can serve files itself."""
        return None

    def create_upload_url(self, key: str) -> str:
        raise StorageError("This storage backend does not support direct uploads")

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

    def save(self, fileobj: BinaryIO, filename: str, content_type: str = "application/octet-stream") -> str:
        key = self.new_key(filename)
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as out:
            shutil.copyfileobj(fileobj, out)
        return key

    def read(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def local_path(self, key: str) -> Path | None:
        return self._path(key)


class SupabaseStorage(StorageBackend):
    """Supabase Storage via its REST API, using a *public* bucket (resources are public)."""

    supports_direct_upload = True

    def __init__(self, url: str, service_key: str, bucket: str, client: httpx.Client | None = None):
        if not url or not service_key:
            raise StorageError("STUDYVAULT_SUPABASE_URL and STUDYVAULT_SUPABASE_SERVICE_KEY are required")
        self.base = f"{url}/storage/v1"
        self.bucket = bucket
        self.http = client or httpx.Client(
            timeout=60, headers={"Authorization": f"Bearer {service_key}", "apikey": service_key}
        )

    def _obj(self, key: str) -> str:
        return f"{self.bucket}/{quote(key)}"

    def _check(self, res: httpx.Response, action: str) -> httpx.Response:
        if res.status_code >= 400:
            raise StorageError(f"Supabase storage {action} failed ({res.status_code}): {res.text[:200]}")
        return res

    def ensure_bucket(self) -> None:
        config = {"public": True, "allowed_mime_types": ALLOWED_MIME_TYPES}
        res = self.http.get(f"{self.base}/bucket/{self.bucket}")
        if res.status_code == 200:
            self._check(self.http.put(f"{self.base}/bucket/{self.bucket}", json=config), "update bucket")
            return
        self._check(
            self.http.post(
                f"{self.base}/bucket",
                json={"id": self.bucket, "name": self.bucket, "public": True, "allowed_mime_types": ALLOWED_MIME_TYPES},
            ),
            "create bucket",
        )

    def empty_bucket(self) -> None:
        self._check(self.http.post(f"{self.base}/bucket/{self.bucket}/empty"), "empty bucket")

    def save(self, fileobj: BinaryIO, filename: str, content_type: str = "application/octet-stream") -> str:
        key = self.new_key(filename)
        self._check(
            self.http.post(f"{self.base}/object/{self._obj(key)}", content=fileobj.read(), headers={"Content-Type": content_type}),
            "upload",
        )
        return key

    def read(self, key: str) -> bytes:
        return self._check(self.http.get(f"{self.base}/object/{self._obj(key)}"), "download").content

    def delete(self, key: str) -> None:
        res = self.http.request("DELETE", f"{self.base}/object/{self.bucket}", json={"prefixes": [key]})
        if res.status_code not in (200, 404):
            self._check(res, "delete")

    def exists(self, key: str) -> bool:
        return self.http.head(f"{self.base}/object/{self._obj(key)}").status_code == 200

    def public_url(self, key: str, download_name: str | None = None) -> str:
        url = f"{self.base}/object/public/{self._obj(key)}"
        return f"{url}?download={quote(download_name)}" if download_name else url

    def create_upload_url(self, key: str) -> str:
        res = self._check(self.http.post(f"{self.base}/object/upload/sign/{self._obj(key)}"), "sign upload")
        return f"{self.base}{res.json()['url']}"


def _supabase(s: Settings) -> StorageBackend:
    return SupabaseStorage(s.supabase_url, s.supabase_service_key, s.supabase_bucket)


_BACKENDS = {"local": lambda s: LocalDiskStorage(s.storage_dir), "supabase": _supabase}
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
