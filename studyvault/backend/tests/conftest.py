import io
import os
import tempfile
from pathlib import Path

os.environ.setdefault(
    "STUDYVAULT_DATABASE_URL", "postgresql+psycopg://studyvault:studyvault@localhost:5432/studyvault_test"
)
os.environ["STUDYVAULT_STORAGE_DIR"] = tempfile.mkdtemp(prefix="sv-test-storage-")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.pdfgen import canvas  # noqa: E402
from sqlalchemy import text  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Subject, Unit, User  # noqa: E402
from app.services.security import hash_password  # noqa: E402

assert "test" in str(engine.url.database), "Refusing to run tests against a non-test database"


@pytest.fixture(scope="session", autouse=True)
def schema():
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def clean_db():
    from app.services.search import invalidate_subject_refs

    invalidate_subject_refs()
    yield
    invalidate_subject_refs()
    with engine.begin() as conn:
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def subjects(db):
    dbms = Subject(code="DBMS", slug="dbms", name="Database Management Systems", description="DB", aliases="dbms,database")
    dbms.units = [Unit(number=i, title=t) for i, t in enumerate(["Intro", "SQL", "Normalization", "Transactions", "Storage"], 1)]
    os_ = Subject(code="OS", slug="operating-systems", name="Operating Systems", description="OS", aliases="os,operating system")
    os_.units = [Unit(number=i, title=t) for i, t in enumerate(["Processes", "Scheduling", "Deadlocks", "Memory", "Files"], 1)]
    db.add_all([dbms, os_])
    db.commit()
    return {"dbms": dbms, "os": os_}


def make_pdf(*lines: str, pages: int = 1) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    for p in range(pages):
        y = 800
        for line in lines:
            c.drawString(72, y, line)
            y -= 18
        c.drawString(72, 60, f"page {p + 1}")
        c.showPage()
    c.save()
    return buf.getvalue()


def signup(client, username: str, password: str = "password123") -> dict:
    res = client.post(
        "/api/auth/signup",
        json={"username": username, "email": f"{username}@test.dev", "full_name": username.title(), "password": password},
    )
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def upload(client, headers, subject: Subject, unit_number: int, title: str, rtype: str = "notes", year: int = 2025, body: str = "", **extra):
    unit = next(u for u in subject.units if u.number == unit_number)
    data = {
        "title": title,
        "subject_id": str(subject.id),
        "unit_id": str(unit.id),
        "resource_type": rtype,
        "year": str(year),
        "description": extra.pop("description", "Helpful material"),
        "tags": extra.pop("tags", "exam,revision"),
        **{k: str(v) for k, v in extra.items()},
    }
    pdf = make_pdf(title, body or "Lecture content")
    return client.post("/api/resources", data=data, files={"file": ("notes.pdf", pdf, "application/pdf")}, headers=headers)


@pytest.fixture
def admin_headers(client, db):
    db.add(User(username="admin", email="admin@test.dev", full_name="Admin", password_hash=hash_password("admin12345"), is_admin=True))
    db.commit()
    res = client.post("/api/auth/login", json={"identifier": "admin", "password": "admin12345"})
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture
def storage_dir() -> Path:
    return Path(os.environ["STUDYVAULT_STORAGE_DIR"])
