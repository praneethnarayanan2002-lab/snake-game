from sqlalchemy import select

from app.models import Resource, ResourceText
from tests.conftest import signup, upload


def test_upload_stores_file_on_disk_and_metadata_in_postgres(client, db, subjects, storage_dir):
    headers = signup(client, "sanjith")
    res = upload(client, headers, subjects["dbms"], 3, "DBMS Unit 3 Normalization Notes", body="BCNF and third normal form explained")
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["subject"]["code"] == "DBMS"
    assert body["unit"]["number"] == 3
    assert body["file_url"] == f"/api/resources/{body['id']}/file"
    assert body["tags"] == ["exam", "revision"]

    row = db.get(Resource, body["id"])
    assert (storage_dir / row.file_key).is_file(), "PDF must live in file storage"
    # Postgres only holds a reference, never the binary.
    assert not hasattr(row, "data") and len(row.file_key) < 255

    text = db.scalar(select(ResourceText.content).where(ResourceText.resource_id == row.id))
    assert "BCNF" in text

    # Public: readable and downloadable without auth.
    assert client.get(f"/api/resources/{row.id}").status_code == 200
    file_res = client.get(f"/api/resources/{row.id}/file")
    assert file_res.status_code == 200
    assert file_res.content.startswith(b"%PDF")
    assert "attachment" in client.get(f"/api/resources/{row.id}/file?download=1").headers["content-disposition"]


def test_upload_requires_auth(client, subjects):
    res = upload(client, {}, subjects["dbms"], 1, "Anonymous notes")
    assert res.status_code == 401


def test_upload_rejects_non_pdf(client, subjects):
    headers = signup(client, "arjun")
    unit = subjects["dbms"].units[0]
    res = client.post(
        "/api/resources",
        data={"title": "Fake", "subject_id": subjects["dbms"].id, "unit_id": unit.id, "resource_type": "notes", "year": 2025, "description": "x", "tags": "x"},
        files={"file": ("fake.pdf", b"hello world", "application/pdf")},
        headers=headers,
    )
    assert res.status_code == 422
    assert "PDF" in res.json()["detail"]


def test_upload_rejects_unit_from_other_subject(client, subjects):
    headers = signup(client, "arjun")
    os_unit = subjects["os"].units[0]
    res = client.post(
        "/api/resources",
        data={"title": "Mismatch", "subject_id": subjects["dbms"].id, "unit_id": os_unit.id, "resource_type": "notes", "year": 2025, "description": "x", "tags": "x"},
        files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
        headers=headers,
    )
    assert res.status_code == 422


def test_upload_requires_description_and_tags(client, subjects):
    headers = signup(client, "arjun")
    res = upload(client, headers, subjects["dbms"], 1, "No tags", tags="")
    assert res.status_code == 422


def test_view_count_increments_and_dedupes_per_user(client, subjects):
    headers = signup(client, "sanjith")
    rid = upload(client, headers, subjects["dbms"], 1, "Intro notes").json()["id"]
    assert client.post(f"/api/resources/{rid}/view").json()["view_count"] == 1
    assert client.post(f"/api/resources/{rid}/view").json()["view_count"] == 2  # anonymous
    assert client.post(f"/api/resources/{rid}/view", headers=headers).json()["view_count"] == 3
    # Same user re-opening within the window doesn't inflate the count.
    assert client.post(f"/api/resources/{rid}/view", headers=headers).json()["view_count"] == 3

    recent = client.get("/api/me/recent", headers=headers).json()
    assert recent[0]["resource"]["id"] == rid
    assert client.put(f"/api/resources/{rid}/progress", json={"page": 1}, headers=headers).status_code == 204


def test_only_owner_or_admin_can_edit_and_delete(client, subjects, admin_headers, storage_dir, db):
    owner = signup(client, "owner")
    other = signup(client, "other")
    rid = upload(client, owner, subjects["dbms"], 2, "SQL notes").json()["id"]
    key = db.get(Resource, rid).file_key

    assert client.patch(f"/api/resources/{rid}", json={"title": "Hacked title"}, headers=other).status_code == 403
    assert client.delete(f"/api/resources/{rid}", headers=other).status_code == 403

    res = client.patch(f"/api/resources/{rid}", json={"title": "SQL joins notes", "tags": ["sql", "joins"]}, headers=owner)
    assert res.status_code == 200
    assert res.json()["title"] == "SQL joins notes"
    assert res.json()["tags"] == ["joins", "sql"]

    assert client.patch(f"/api/resources/{rid}", json={"year": 2024}, headers=admin_headers).json()["year"] == 2024
    assert client.delete(f"/api/resources/{rid}", headers=admin_headers).status_code == 204
    assert client.get(f"/api/resources/{rid}").status_code == 404
    assert not (storage_dir / key).exists(), "file should be removed from storage"
