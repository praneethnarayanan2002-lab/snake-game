from tests.conftest import signup, upload


def test_admin_manages_subjects_and_units(client, subjects, admin_headers):
    res = client.post(
        "/api/admin/subjects",
        json={"code": "SE", "slug": "software-engineering", "name": "Software Engineering", "description": "", "aliases": "se"},
        headers=admin_headers,
    )
    assert res.status_code == 201
    sid = res.json()["id"]
    res = client.post(f"/api/admin/subjects/{sid}/units", json={"number": 1, "title": "SDLC"}, headers=admin_headers)
    assert [u["title"] for u in res.json()["units"]] == ["SDLC"]
    assert client.post(f"/api/admin/subjects/{sid}/units", json={"number": 1, "title": "Dup"}, headers=admin_headers).status_code == 409
    assert client.get("/api/search", params={"q": "se"}).json()["parsed"]["subject"]["slug"] == "software-engineering"


def test_admin_cannot_delete_unit_with_resources(client, subjects, admin_headers):
    h = signup(client, "user1")
    upload(client, h, subjects["dbms"], 1, "Intro notes")
    unit_id = subjects["dbms"].units[0].id
    assert client.delete(f"/api/admin/units/{unit_id}", headers=admin_headers).status_code == 409


def test_purge_spammer(client, subjects, admin_headers):
    spam = signup(client, "spammer")
    upload(client, spam, subjects["dbms"], 1, "FREE NOTES CLICK")
    upload(client, spam, subjects["os"], 1, "FREE NOTES CLICK 2")
    spammer_id = client.get("/api/auth/me", headers=spam).json()["id"]
    assert client.post(f"/api/admin/users/{spammer_id}/purge", headers=spam).status_code == 403
    assert client.post(f"/api/admin/users/{spammer_id}/purge", headers=admin_headers).json() == {"deleted": 2}
    assert client.get("/api/search").json()["total"] == 0


def test_non_admin_forbidden(client, subjects):
    h = signup(client, "student")
    assert client.get("/api/admin/overview", headers=h).status_code == 403
    assert client.get("/api/admin/overview").status_code == 401
