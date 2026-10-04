import json

import pytest

from app.config import get_settings
from app.models import Subject
from app.services.curriculum import load_curriculum, short_code
from tests.conftest import signup, upload


def _course(code, title, reg, year, sem, branches, units=5, kind="theory"):
    return {
        "code": code, "title": title, "ltpc": [3, 0, 0, 3], "year": year, "semester": sem, "kind": kind,
        "outcomes": ["Understand things"], "books": ["Some book"], "lab_tasks": "Task-1: do it" if kind == "lab" else "",
        "units": [{"number": n, "title": f"{title} topic {n}", "topics": f"details {n}"} for n in range(1, units + 1)] if kind == "theory" else [],
        "regulation": reg, "book": f"{reg}_CSE", "pages": [1, 2], "source_url": "https://www.griet.ac.in/x.pdf",
        "offerings": [{"branch": b, "year": year, "semester": sem, "elective": None} for b in branches],
    }


@pytest.fixture
def curriculum(db, tmp_path):
    data = {
        "source": "https://www.griet.ac.in/syllabus.php",
        "branches": {"CSE": "Computer Science and Engineering", "ECE": "Electronics and Communication Engineering"},
        "courses": [
            _course("GR22A2069", "Database Management Systems", "GR22", 2, 1, ["CSE"]),
            _course("GR24A2069", "Database Management Systems", "GR24", 2, 1, ["CSE"]),
            _course("GR24A2070", "Database Management Systems Lab", "GR24", 2, 1, ["CSE"], kind="lab"),
            _course("GR24A3001", "Signals and Systems", "GR24", 3, 1, ["ECE"]),
            _course("GR24A1001", "Linear Algebra and Function Approximation", "GR24", 1, 1, ["CSE", "ECE"]),
        ],
    }
    path = tmp_path / "curriculum.json"
    path.write_text(json.dumps(data))
    stats = load_curriculum(db, path)
    assert stats["created"] == 5
    # Idempotent re-run updates instead of duplicating.
    assert load_curriculum(db, path)["updated"] == 5
    return {s.course_code: s for s in db.query(Subject).all()}


def test_short_codes():
    assert short_code("Database Management Systems", "theory") == ("DBMS", ["dbms", "database"])
    assert short_code("Database Management Systems Lab", "lab")[0] == "DBMS LAB"
    assert short_code("Microwave and Optical Communications", "theory")[0] == "MOC"


def test_loader_builds_subjects_units_and_offerings(client, curriculum):
    detail = client.get("/api/subjects/gr24a2069").json()
    assert detail["course_code"] == "GR24A2069" and detail["regulation"] == "GR24" and detail["code"] == "DBMS"
    assert len(detail["units"]) == 5 and detail["outcomes"] == ["Understand things"]
    assert [o["branch_code"] for o in detail["offerings"]] == ["CSE"]
    lab = client.get("/api/subjects/gr24a2070").json()
    assert lab["kind"] == "lab" and lab["units"][0]["title"] == "Lab experiments"
    common = client.get("/api/subjects/gr24a1001").json()
    assert {o["branch_code"] for o in common["offerings"]} == {"CSE", "ECE"}


def test_subject_listing_filters(client, curriculum):
    names = lambda **p: [s["course_code"] for s in client.get("/api/subjects", params=p).json()]  # noqa: E731
    assert set(names(branch="CSE", regulation="GR24", year=2, semester=1)) == {"GR24A2069", "GR24A2070"}
    assert names(branch="ECE", regulation="GR24", year=3) == ["GR24A3001"]
    assert names(q="signals") == ["GR24A3001"]
    branches = {b["code"]: b["subject_count"] for b in client.get("/api/branches").json()}
    assert branches == {"CSE": 4, "ECE": 2}
    hits = client.get("/api/subjects/lookup", params={"q": "database"}).json()
    assert {s["course_code"] for s in hits["subjects"]} >= {"GR22A2069", "GR24A2069"}


def test_search_groups_same_course_across_regulations(client, curriculum):
    h = signup(client, "nisha")
    a = upload(client, h, curriculum["GR22A2069"], 3, "GR22 DBMS notes", body="normal forms").json()
    b = upload(client, h, curriculum["GR24A2069"], 3, "GR24 DBMS notes", body="normal forms").json()
    res = client.get("/api/search", params={"q": "dbms unit 3"}).json()
    assert set(res["parsed"]["subject"]["ids"]) == {curriculum["GR22A2069"].id, curriculum["GR24A2069"].id}
    assert {r["id"] for r in res["items"]} == {a["id"], b["id"]}
    only24 = client.get("/api/search", params={"q": "dbms", "regulation": "GR24"}).json()["items"]
    assert [r["id"] for r in only24] == [b["id"]]
    by_branch = client.get("/api/search", params={"branch": "ECE"}).json()["items"]
    assert by_branch == []


def test_signup_with_academic_profile_drives_dashboard(client, curriculum):
    res = client.post(
        "/api/auth/signup",
        json={"username": "ravi", "email": "ravi@test.dev", "full_name": "Ravi", "password": "password123", "branch": "cse", "regulation": "GR24", "current_year": 2, "current_semester": 1},
    )
    assert res.status_code == 201, res.text
    me = res.json()["user"]
    assert (me["branch_code"], me["regulation"], me["current_year"], me["college"]) == ("CSE", "GR24", 2, "GRIET")
    h = {"Authorization": f"Bearer {res.json()['access_token']}"}
    dash = client.get("/api/me/dashboard", headers=h).json()
    assert [s["course_code"] for s in dash["subjects"]][:2] == ["GR24A2069", "GR24A2070"]
    upd = client.patch("/api/auth/me", json={"branch": "ECE", "current_year": 3}, headers=h).json()
    assert upd["branch_code"] == "ECE" and upd["current_year"] == 3
    assert client.patch("/api/auth/me", json={"branch": "XYZ"}, headers=h).status_code == 422


def test_optional_email_domain_restriction(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "allowed_email_domains", ["griet.ac.in"])
    bad = client.post("/api/auth/signup", json={"username": "outsider", "email": "x@gmail.com", "full_name": "X", "password": "password123"})
    assert bad.status_code == 422 and "griet.ac.in" in bad.json()["detail"]
    ok = client.post("/api/auth/signup", json={"username": "insider", "email": "y@griet.ac.in", "full_name": "Y", "password": "password123"})
    assert ok.status_code == 201
