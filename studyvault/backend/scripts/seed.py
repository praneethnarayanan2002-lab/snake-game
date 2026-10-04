"""Seed StudyVault with GRIET's real curriculum.

    python -m scripts.seed [--reset] [--pdf-dir DIR] [--no-excerpts]

- Branches, courses, units, outcomes and textbooks come from data/griet_curriculum.json,
  built from the official syllabus books on griet.ac.in (see scripts/griet_scrape.py).
- Every course also gets one document: its own pages cut from the official GRIET syllabus
  book, uploaded as "Reference Material" by the "Official GRIET syllabus" account.
- No invented notes, ratings or engagement are created.
"""

import argparse
import io
import json
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from sqlalchemy import func, select, text

from app.config import get_settings
from app.constants import regulation_for_year
from app.database import Base, SessionLocal
from app.models import Resource, ResourceText, Subject, User
from app.services.curriculum import DATA_FILE, load_curriculum, semester_label
from app.services.documents import extract_document
from app.services.resources import set_tags
from app.services.security import hash_password
from app.services.storage import SupabaseStorage, get_storage
from scripts import griet_scrape

SYLLABUS_USERNAME = "griet_syllabus"


def reset(db) -> None:
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    db.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    db.commit()
    storage = get_storage()
    if isinstance(storage, SupabaseStorage):
        storage.ensure_bucket()
        storage.empty_bucket()
    elif (storage_dir := get_settings().storage_dir).exists():
        shutil.rmtree(storage_dir)


def ensure_user(db, username: str, **fields) -> User:
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        user = User(username=username, **fields)
        db.add(user)
        db.commit()
    return user


@lru_cache(maxsize=32)
def _book(path: str) -> PdfReader:
    return PdfReader(path)


def excerpt(pdf_dir: Path, course: dict) -> bytes:
    reader = _book(str(pdf_dir / f"{course['book']}.pdf"))
    first, last = course["pages"]
    writer = PdfWriter()
    for i in range(first - 1, min(last, len(reader.pages))):
        writer.add_page(reader.pages[i])
    writer.add_metadata({"/Title": f"{course['title']} ({course['code']}) — GRIET {course['regulation']} syllabus", "/Author": "GRIET"})
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def seed_excerpts(db, pdf_dir: Path, uploader: User) -> int:
    storage = get_storage()
    courses = json.loads(DATA_FILE.read_text())["courses"]
    subjects = {s.course_code: s for s in db.scalars(select(Subject).where(Subject.course_code.is_not(None)))}
    have = set(db.scalars(select(Subject.course_code).join(Resource, Resource.subject_id == Subject.id).where(Resource.uploaded_by == uploader.id)))
    todo = [c for c in courses if c["code"] in subjects and c["code"] not in have]
    if not todo:
        return 0
    griet_scrape.download(pdf_dir)

    # Cutting pages is CPU-bound and single-threaded per book; uploads run in parallel.
    prepared = [(c, excerpt(pdf_dir, c)) for c in todo]

    def upload(item):
        c, data = item
        name = f"{c['code']} {c['title']} - GRIET {c['regulation']} syllabus.pdf".replace("/", "-")
        info = extract_document(io.BytesIO(data), name)
        return c, data, name, info, storage.save(io.BytesIO(data), name, info.mime)

    with ThreadPoolExecutor(max_workers=8) as pool:
        for i, (c, data, name, info, key) in enumerate(pool.map(upload, prepared), 1):
            s = subjects[c["code"]]
            r = Resource(
                title=f"Official syllabus — {c['title']} ({c['regulation']})",
                description=(
                    f"The {c['code']} pages from GRIET's {c['regulation']} B.Tech syllabus book "
                    f"({c['book'].split('_', 1)[1]}, pages {c['pages'][0]}–{c['pages'][1]}): course outcomes, all units and textbooks. "
                    f"{semester_label(c['year'], c['semester'])}. Source: {c['source_url']}"
                ).strip(),
                file_key=key,
                file_name=name,
                file_size=len(data),
                file_type=info.kind,
                mime_type=info.mime,
                page_count=info.page_count,
                subject_id=s.id,
                unit_id=s.units[0].id,
                resource_type="reference",
                year=2000 + int(c["regulation"][2:4]),
                uploaded_by=uploader.id,
            )
            set_tags(db, r, [c["code"].lower(), c["regulation"].lower(), "official syllabus", s.code.lower()])
            r.text = ResourceText(content=info.text)
            db.add(r)
            if i % 100 == 0:
                db.commit()
                print(f"  {i}/{len(prepared)}")
    db.commit()
    return len(prepared)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="wipe ALL data (users, uploads) first")
    parser.add_argument("--pdf-dir", type=Path, default=Path("/tmp/griet-syllabus"), help="cache for the official syllabus PDFs")
    parser.add_argument("--no-excerpts", action="store_true", help="skip the per-course official syllabus documents")
    args = parser.parse_args()

    db = SessionLocal()
    if args.reset:
        reset(db)
    storage = get_storage()
    if isinstance(storage, SupabaseStorage):
        storage.ensure_bucket()

    print("· GRIET curriculum")
    print("  ", load_curriculum(db))

    print("· accounts")
    from app.models import Branch

    cse = db.scalar(select(Branch).where(Branch.code == "CSE"))
    ensure_user(db, "admin", email="admin@studyvault.dev", full_name="StudyVault Admin", password_hash=hash_password("admin12345"), is_admin=True, college="GRIET")
    ensure_user(
        db, "sanjith", email="sanjith@studyvault.dev", full_name="Sanjith Kumar", password_hash=hash_password("sanjith12345"),
        college="GRIET", branch_id=cse.id if cse else None, regulation=regulation_for_year(3), current_year=3, current_semester=1,
    )
    official = ensure_user(
        db, SYLLABUS_USERNAME, email="syllabus@studyvault.dev", full_name="Official GRIET syllabus",
        password_hash=hash_password(get_settings().secret_key + SYLLABUS_USERNAME), college="GRIET",
    )

    if not args.no_excerpts:
        print("· official syllabus documents")
        print(f"   added {seed_excerpts(db, args.pdf_dir, official)}")

    print(
        f"Done: {db.scalar(select(func.count(Subject.id)))} courses, "
        f"{db.scalar(select(func.count(Resource.id)))} resources, {db.scalar(select(func.count(User.id)))} users."
    )
    print("Logins:  admin / admin12345   ·   sanjith / sanjith12345")


if __name__ == "__main__":
    sys.exit(main())
