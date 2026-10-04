import io
import json

import httpx
import pytest

from app.config import Settings
from app.services.storage import StorageBackend, SupabaseStorage, set_storage
from tests.conftest import make_pdf, signup


class FakeSupabase:
    """Minimal in-memory stand-in for the Supabase Storage REST API."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.buckets: set[str] = set()
        self.calls: list[tuple[str, str]] = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        path = req.url.path.removeprefix("/storage/v1")
        self.calls.append((req.method, path))
        assert req.headers["apikey"] == "service-key"
        if req.method == "GET" and path.startswith("/bucket/"):
            return httpx.Response(200 if path.split("/")[2] in self.buckets else 404, json={})
        if req.method == "POST" and path == "/bucket":
            self.buckets.add(json.loads(req.content)["id"])
            return httpx.Response(200, json={})
        if req.method == "POST" and path.startswith("/object/upload/sign/"):
            return httpx.Response(200, json={"url": f"/object/upload/sign/{path.split('/sign/')[1]}?token=t"})
        if req.method == "POST" and path.startswith("/object/"):
            self.objects[path.removeprefix("/object/")] = req.content
            return httpx.Response(200, json={})
        if req.method in ("GET", "HEAD") and path.startswith("/object/"):
            key = path.removeprefix("/object/")
            return httpx.Response(200, content=self.objects[key]) if key in self.objects else httpx.Response(404)
        if req.method == "DELETE":
            body = json.loads(req.content)
            for p in body["prefixes"]:
                self.objects.pop(f"pdfs/{p}", None)
            return httpx.Response(200, json=[])
        return httpx.Response(400)


@pytest.fixture
def supa():
    fake = FakeSupabase()
    client = httpx.Client(transport=httpx.MockTransport(fake), headers={"apikey": "service-key", "Authorization": "Bearer service-key"})
    return fake, SupabaseStorage("https://proj.supabase.co", "service-key", "pdfs", client=client)


def test_supabase_backend_roundtrip(supa):
    fake, storage = supa
    storage.ensure_bucket()
    assert "pdfs" in fake.buckets
    key = storage.save(io.BytesIO(b"%PDF-1.4 hello"), "notes.pdf")
    assert storage.exists(key) and storage.read(key) == b"%PDF-1.4 hello"
    assert storage.public_url(key) == f"https://proj.supabase.co/storage/v1/object/public/pdfs/{key}"
    assert storage.public_url(key, "My Notes.pdf").endswith("?download=My%20Notes.pdf")
    assert storage.create_upload_url(key).startswith("https://proj.supabase.co/storage/v1/object/upload/sign/pdfs/")
    storage.delete(key)
    assert not storage.exists(key)


def test_settings_normalise_supabase_urls():
    s = Settings(database_url="postgres://u:p@db.supabase.co:6543/postgres", supabase_url="https://x.supabase.co/")
    assert s.database_url.startswith("postgresql+psycopg://")
    assert s.supabase_url == "https://x.supabase.co"


class DirectStorage(StorageBackend):
    """In-memory backend that claims direct-upload support (like Supabase)."""

    supports_direct_upload = True

    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def save(self, fileobj, filename):
        key = self.new_key(filename)
        self.objects[key] = fileobj.read()
        return key

    def read(self, key):
        return self.objects[key]

    def delete(self, key):
        self.objects.pop(key, None)

    def exists(self, key):
        return key in self.objects

    def public_url(self, key, download_name=None):
        return f"https://cdn.test/{key}"

    def create_upload_url(self, key):
        return f"https://cdn.test/upload/{key}"


@pytest.fixture
def direct():
    storage = DirectStorage()
    set_storage(storage)
    yield storage
    set_storage(None)


def _meta(subjects):
    s = subjects["dbms"]
    return {"title": "Direct upload notes", "subject_id": s.id, "unit_id": s.units[0].id, "resource_type": "notes", "year": 2025, "description": "d", "tags": "x"}


def test_direct_upload_flow(client, subjects, direct):
    h = signup(client, "nisha")
    assert client.get("/api/meta").json()["direct_upload"] is True
    res = client.post("/api/resources/upload-url", json={"filename": "n.pdf", "size": 1000}, headers=h).json()
    assert res["upload_url"].startswith("https://cdn.test/upload/")
    direct.objects[res["key"]] = make_pdf("Direct upload body text")  # what the browser PUT would do

    created = client.post("/api/resources", data={**_meta(subjects), "file_key": res["key"], "file_name": "n.pdf"}, headers=h)
    assert created.status_code == 201, created.text
    rid = created.json()["id"]
    assert client.get(f"/api/resources/{rid}/file", follow_redirects=False).headers["location"] == f"https://cdn.test/{res['key']}"
    # The same object can't be registered twice.
    again = client.post("/api/resources", data={**_meta(subjects), "file_key": res["key"]}, headers=h)
    assert again.status_code == 403


def test_direct_upload_rejects_foreign_and_invalid_objects(client, subjects, direct):
    owner, thief = signup(client, "owner"), signup(client, "thief")
    key = client.post("/api/resources/upload-url", json={"filename": "n.pdf", "size": 10}, headers=owner).json()["key"]
    direct.objects[key] = b"not a pdf"
    assert client.post("/api/resources", data={**_meta(subjects), "file_key": key}, headers=thief).status_code == 403
    assert client.post("/api/resources", data={**_meta(subjects), "file_key": key}, headers=owner).status_code == 422
    assert key not in direct.objects, "invalid uploads are cleaned up"
    too_big = client.post("/api/resources/upload-url", json={"filename": "n.pdf", "size": 50 * 1024 * 1024}, headers=owner)
    assert too_big.status_code == 413
