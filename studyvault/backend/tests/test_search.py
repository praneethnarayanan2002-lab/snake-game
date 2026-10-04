from datetime import UTC, datetime

import pytest

from app.services.query_parser import SubjectRef, parse_query
from app.services.ranking import Candidate, GlobalStats, score_candidates
from tests.conftest import signup, upload

SUBJECTS = [
    SubjectRef(1, "dbms", "DBMS", "Database Management Systems", ["dbms", "database"]),
    SubjectRef(2, "data-structures", "DS", "Data Structures", ["ds", "dsa"]),
    SubjectRef(3, "operating-systems", "OS", "Operating Systems", ["os", "operating system"]),
]


@pytest.mark.parametrize(
    "query, subject, unit, rtype, year, exam, keywords",
    [
        ("DBMS normalization", "dbms", None, None, None, None, ["normalization"]),
        ("DBMS Unit 3", "dbms", 3, None, None, None, []),
        ("DBMS semester paper 2025", "dbms", None, "semester", 2025, None, []),
        ("Operating systems deadlock", "operating-systems", None, None, None, None, ["deadlock"]),
        ("Data structures previous year paper", "data-structures", None, "pyq", None, None, []),
        ("os unit iii pyq", "operating-systems", 3, "pyq", None, None, []),
        ("dbms mid 1 2024", "dbms", None, "mid", 2024, "mid1", []),
        ("bankers algorithm", None, None, None, None, None, ["bankers", "algorithm"]),
    ],
)
def test_query_parser(query, subject, unit, rtype, year, exam, keywords):
    p = parse_query(query, SUBJECTS)
    assert (p.subject.slug if p.subject else None) == subject
    assert p.unit_number == unit
    assert p.resource_type == rtype
    assert p.year == year
    assert p.exam_type == exam
    assert p.keywords == keywords


def _cand(i, **kw):
    base = dict(id=i, subject_id=1, unit_number=1, resource_type="notes", year=2025, exam_type=None, star_count=0, view_count=0, average_rating=0, rating_count=0, created_at=datetime.now(UTC), text_score=0.0)
    return Candidate(**{**base, **kw})


def test_facet_match_beats_raw_popularity():
    q = parse_query("DBMS semester paper 2025", SUBJECTS)
    popular_notes = _cand(1, star_count=100, view_count=5000, average_rating=4.9, rating_count=50)
    fresh_paper = _cand(2, resource_type="semester", year=2025)
    scores = score_candidates([popular_notes, fresh_paper], q, GlobalStats(100, 5000))
    assert scores[2].total > scores[1].total


def test_popularity_breaks_ties_between_equally_relevant():
    q = parse_query("DBMS unit 3 notes", SUBJECTS)
    a = _cand(1, unit_number=3, star_count=2)
    b = _cand(2, unit_number=3, star_count=40, average_rating=4.6, rating_count=12)
    scores = score_candidates([a, b], q, GlobalStats(40, 100))
    assert scores[2].total > scores[1].total


def test_search_endpoint_uses_pdf_text_and_labels_recommended(client, subjects):
    h = signup(client, "sanjith")
    upload(client, h, subjects["os"], 3, "Unit 3 handout", body="Bankers algorithm safe sequence deadlock avoidance")
    upload(client, h, subjects["os"], 1, "Process states handout", body="Process control block and context switch")
    res = client.get("/api/search", params={"q": "operating systems bankers"}).json()
    assert res["parsed"]["subject"]["slug"] == "operating-systems"
    assert res["items"][0]["title"] == "Unit 3 handout"
    assert res["items"][0]["recommended"] is True
    assert all(not r["recommended"] for r in res["items"][1:])


def test_filters(client, subjects):
    h = signup(client, "sanjith")
    upload(client, h, subjects["dbms"], 3, "Unit 3 PYQ", rtype="pyq", year=2024)
    upload(client, h, subjects["dbms"], 3, "Unit 3 notes", rtype="notes", year=2025)
    upload(client, h, subjects["os"], 3, "OS unit 3 notes", rtype="notes", year=2025)
    titles = lambda params: [r["title"] for r in client.get("/api/search", params=params).json()["items"]]  # noqa: E731
    assert titles({"subject": "dbms", "type": "pyq"}) == ["Unit 3 PYQ"]
    assert set(titles({"unit": 3, "year": 2025})) == {"Unit 3 notes", "OS unit 3 notes"}
    assert titles({"q": "dbms", "subject": "operating-systems"}) == []


def test_core_flow_stars_and_ratings_raise_ranking(client, subjects):
    """Sign up → upload → others search → star/rate → resource climbs the ranking."""
    alice = signup(client, "alice")
    a_id = upload(client, alice, subjects["dbms"], 3, "Normalization notes A", body="normalization 3NF BCNF").json()["id"]
    b_id = upload(client, alice, subjects["dbms"], 3, "Normalization notes B", body="normalization 3NF BCNF").json()["id"]

    def order():
        return [r["id"] for r in client.get("/api/search", params={"q": "dbms normalization"}).json()["items"]]

    leader = order()[0]
    underdog = b_id if leader == a_id else a_id
    for i in range(4):
        fan = signup(client, f"fan{i}")
        client.post(f"/api/resources/{underdog}/view", headers=fan)
        client.post(f"/api/resources/{underdog}/star", headers=fan)
        client.put(f"/api/resources/{underdog}/rating", json={"rating": 5}, headers=fan)

    ranked = order()
    assert ranked[0] == underdog
    top = client.get("/api/search", params={"q": "dbms normalization"}).json()["items"][0]
    assert top["recommended"] and top["star_count"] == 4 and top["average_rating"] == 5


def test_exam_plan(client, subjects):
    h = signup(client, "sanjith")
    upload(client, h, subjects["dbms"], 3, "DBMS 2025 semester", rtype="semester", year=2025, exam_type="semester")
    upload(client, h, subjects["dbms"], 3, "Unit 3 notes", rtype="notes")
    upload(client, h, subjects["dbms"], 2, "Unit 2 question bank", rtype="question_bank")
    plan = client.get("/api/exam-plan", params={"subject": "dbms", "exam": "semester"}).json()
    steps = {s["key"]: [i["title"] for i in s["items"]] for s in plan["steps"]}
    assert "DBMS 2025 semester" in steps["pyq"]
    assert steps["notes"] == ["Unit 3 notes"]
    assert "Unit 2 question bank" in steps["bank"]
