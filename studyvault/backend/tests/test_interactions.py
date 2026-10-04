import pytest
from sqlalchemy.exc import IntegrityError

from app.models import ResourceRating, ResourceStar
from tests.conftest import signup, upload


@pytest.fixture
def resource_id(client, subjects):
    return upload(client, signup(client, "uploader"), subjects["dbms"], 3, "Normalization notes").json()["id"]


def test_star_is_idempotent_and_toggleable(client, resource_id):
    h = signup(client, "fan")
    assert client.post(f"/api/resources/{resource_id}/star", headers=h).json()["star_count"] == 1
    again = client.post(f"/api/resources/{resource_id}/star", headers=h).json()
    assert again["star_count"] == 1, "no duplicate stars"
    assert again["viewer"]["starred"] is True
    off = client.delete(f"/api/resources/{resource_id}/star", headers=h).json()
    assert off["star_count"] == 0 and off["viewer"]["starred"] is False


def test_unique_star_constraint_in_database(db, client, resource_id):
    signup(client, "fan")
    db.add(ResourceStar(user_id=2, resource_id=resource_id))
    db.commit()
    db.add(ResourceStar(user_id=2, resource_id=resource_id))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_rating_average_and_update(client, resource_id):
    a, b = signup(client, "a_user"), signup(client, "b_user")
    client.put(f"/api/resources/{resource_id}/rating", json={"rating": 5}, headers=a)
    stats = client.put(f"/api/resources/{resource_id}/rating", json={"rating": 2}, headers=b).json()
    assert stats["rating_count"] == 2 and stats["average_rating"] == 3.5
    stats = client.put(f"/api/resources/{resource_id}/rating", json={"rating": 4}, headers=b).json()
    assert stats["rating_count"] == 2 and stats["average_rating"] == 4.5
    assert stats["viewer"]["my_rating"] == 4


@pytest.mark.parametrize("value", [0, 6])
def test_rating_out_of_range_rejected(client, resource_id, value):
    h = signup(client, "rater")
    assert client.put(f"/api/resources/{resource_id}/rating", json={"rating": value}, headers=h).status_code == 422


def test_rating_check_constraint_in_database(db, client, resource_id):
    signup(client, "rater")
    db.add(ResourceRating(user_id=2, resource_id=resource_id, rating=9))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_bookmarks(client, resource_id):
    h = signup(client, "reader")
    assert client.post(f"/api/resources/{resource_id}/bookmark", headers=h).json()["viewer"]["bookmarked"]
    client.post(f"/api/resources/{resource_id}/bookmark", headers=h)
    items = client.get("/api/me/bookmarks", headers=h).json()
    assert [r["id"] for r in items] == [resource_id]
    client.delete(f"/api/resources/{resource_id}/bookmark", headers=h)
    assert client.get("/api/me/bookmarks", headers=h).json() == []


def test_report_and_admin_resolution(client, resource_id, admin_headers):
    h = signup(client, "reporter")
    assert client.post(f"/api/resources/{resource_id}/report", json={"reason": "bogus"}, headers=h).status_code == 422
    assert client.post(f"/api/resources/{resource_id}/report", json={"reason": "spam", "details": "ads"}, headers=h).status_code == 201

    assert client.get("/api/admin/reports", headers=h).status_code == 403
    reports = client.get("/api/admin/reports", headers=admin_headers).json()
    assert len(reports) == 1 and reports[0]["reason"] == "spam"
    client.patch(f"/api/admin/reports/{reports[0]['id']}", json={"status": "resolved"}, headers=admin_headers)
    assert client.get("/api/admin/reports", headers=admin_headers).json() == []


def test_dashboard_stats(client, subjects):
    owner = signup(client, "owner")
    rid = upload(client, owner, subjects["dbms"], 1, "Intro notes").json()["id"]
    fan = signup(client, "fan")
    client.post(f"/api/resources/{rid}/star", headers=fan)
    client.post(f"/api/resources/{rid}/bookmark", headers=owner)
    client.post(f"/api/resources/{rid}/view", headers=owner)
    dash = client.get("/api/me/dashboard", headers=owner).json()
    assert dash["stats"] == {"uploads": 1, "stars_received": 1, "views_received": 1, "bookmarks": 1}
    assert dash["recent"][0]["resource"]["id"] == rid
    assert dash["subjects"][0]["code"] == "DBMS"
