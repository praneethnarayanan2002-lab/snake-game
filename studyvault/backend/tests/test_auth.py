from tests.conftest import signup


def test_signup_login_me(client):
    headers = signup(client, "sanjith")
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["username"] == "sanjith"
    assert me["is_admin"] is False

    res = client.post("/api/auth/login", json={"identifier": "SANJITH@test.dev", "password": "password123"})
    assert res.status_code == 200
    assert res.json()["user"]["username"] == "sanjith"


def test_duplicate_username_and_bad_password(client):
    signup(client, "priya")
    res = client.post("/api/auth/signup", json={"username": "priya", "email": "other@test.dev", "full_name": "P", "password": "password123"})
    assert res.status_code == 409
    assert client.post("/api/auth/login", json={"identifier": "priya", "password": "nope-nope"}).status_code == 401


def test_short_password_rejected(client):
    res = client.post("/api/auth/signup", json={"username": "x_y", "email": "x@test.dev", "full_name": "X", "password": "short"})
    assert res.status_code == 422


def test_protected_routes_require_auth(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/me/dashboard").status_code == 401
    assert client.post("/api/resources/1/star").status_code == 401


def test_public_profile_hides_email(client, subjects):
    signup(client, "meera")
    res = client.get("/api/users/meera")
    assert res.status_code == 200
    assert "email" not in res.json()["user"]
    assert "meera@test.dev" not in res.text
