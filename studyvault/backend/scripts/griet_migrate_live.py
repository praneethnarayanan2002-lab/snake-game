"""One-off: move the live database from the old generated demo data to GRIET's curriculum.

    python -m scripts.griet_migrate_live [--apply] [--pdf-dir DIR]

Without --apply it only prints the plan. Real people's accounts and uploads are kept:
uploads on the old demo subjects are moved to the matching current GRIET course/unit.
Then the generated demo resources (and their stored files), the old demo subjects and
the fake demo accounts are deleted; admin and sanjith stay. Finally the GRIET
curriculum and the official syllabus excerpts are loaded (same as scripts.seed, no reset).
"""

import argparse
import re
import sys
from pathlib import Path

from sqlalchemy import func, select

from app.config import get_settings
from app.constants import regulation_for_year
from app.database import SessionLocal
from app.models import Branch, Resource, Subject, Unit, User
from app.services.curriculum import load_curriculum
from app.services.resources import refresh_counters, set_tags
from app.services.security import hash_password
from app.services.storage import SupabaseStorage, get_storage
from scripts.seed import SYLLABUS_USERNAME, ensure_user, seed_excerpts

KEEP_SEEDED = {"admin", "sanjith"}
FAKE_NAMED = {"priya", "arjun", "meera", "rahul", "kavya", "aditya", "freenotes_hub"}
CROWD_NAMES = "ananya|rohan|sneha|vikram|divya|karthik|neha|siddharth|pooja|varun|ishita|nikhil|shreya|harsha|tanvi|manoj|riya|abhishek|lakshmi|yash"
CROWD = re.compile(rf"^({CROWD_NAMES})\d{{2}}$")

# Hand-picked targets for real uploads: resource id -> (course code, unit number, reason).
REASSIGN = {
    138: (
        "GR25A2076",
        1,
        "MATH 'Discrete Mathematics & Logic' notes ('given by dm sir') -> Discrete Mathematics (GR25, II-I for CSE/CSM/CSD/CSBS), Unit 1 Mathematical Logic",
    ),
}
# Fallback for any other real upload on an old demo subject: old code -> current course title.
FALLBACK = {
    "DBMS": "Database Management Systems",
    "DS": "Data Structures",
    "OS": "Operating Systems",
    "CN": "Computer Networks",
    "MATH": "Discrete Mathematics",
}


def is_fake(u: User) -> bool:
    if u.username in FAKE_NAMED:
        return True
    return bool(CROWD.match(u.username)) and u.email.endswith("@studyvault.dev")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--pdf-dir", type=Path, default=Path("/tmp/griet/pdfs"))
    args = parser.parse_args()
    db = SessionLocal()
    storage = get_storage()

    print("· GRIET curriculum")
    if args.apply:
        print("  ", load_curriculum(db))
    else:
        print("   (dry run: would load the current-regulation curriculum)")

    users = list(db.scalars(select(User).order_by(User.id)))
    fake = [u for u in users if is_fake(u)]
    seeded_ids = {u.id for u in fake} | {u.id for u in users if u.username in KEEP_SEEDED}
    real = [u for u in users if u.id not in seeded_ids and u.username != SYLLABUS_USERNAME]
    print(f"· users: {len(users)} total · {len(fake)} fake demo accounts to delete · keeping admin, sanjith and {len(real)} real: {[u.username for u in real]}")

    old_subjects = list(db.scalars(select(Subject).where(Subject.course_code.is_(None))))
    old_ids = [s.id for s in old_subjects]
    on_old = list(db.scalars(select(Resource).where(Resource.subject_id.in_(old_ids)))) if old_ids else []
    to_move = [r for r in on_old if r.uploaded_by not in seeded_ids]
    to_delete = [r for r in on_old if r.uploaded_by in seeded_ids]
    print(f"· old demo subjects: {[s.code for s in old_subjects]} · {len(on_old)} resources on them: {len(to_delete)} generated, {len(to_move)} real uploads")

    moves = []
    for r in to_move:
        old_unit = db.get(Unit, r.unit_id)
        if r.id in REASSIGN:
            code, unit_no, reason = REASSIGN[r.id]
            target = db.scalar(select(Subject).where(Subject.course_code == code))
        else:
            title = FALLBACK.get(r.subject.code, r.subject.name)
            target = db.scalar(select(Subject).where(func.lower(Subject.name) == title.lower(), Subject.kind == "theory").order_by(Subject.year))
            unit_no, reason = old_unit.number if old_unit else 1, f"fallback: same course name '{title}', same unit number"
        if target is None and not args.apply:
            print(f"   - #{r.id} '{r.title}' -> (course not loaded yet in dry run) {reason}")
            continue
        assert target is not None, f"no target course for resource {r.id}"
        unit = next((u for u in target.units if u.number == unit_no), target.units[0])
        moves.append((r, target, unit, old_unit, reason))
        print(f"   - #{r.id} '{r.title}' by user {r.uploaded_by}: {r.subject.code} unit {old_unit.number if old_unit else '?'} -> {target.course_code} {target.name} unit {unit.number} ({unit.title}). {reason}")

    if not args.apply:
        print("Dry run only. Re-run with --apply.")
        return

    for r, target, unit, old_unit, _ in moves:
        old_title = r.title
        if old_unit and r.title.startswith(f"{r.subject.code} Unit {old_unit.number}"):
            r.title = f"{target.code} Unit {unit.number}" + r.title[len(f"{r.subject.code} Unit {old_unit.number}") :]
        r.subject_id, r.unit_id = target.id, unit.id
        set_tags(db, r, list(dict.fromkeys([*(t.name for t in r.tags if t.name != "math"), target.code.lower(), target.course_code.lower()])))
        print(f"   moved #{r.id}: title '{old_title}' -> '{r.title}'")
    db.commit()

    keys = [r.file_key for r in to_delete]
    for r in to_delete:
        db.delete(r)
    db.commit()
    if isinstance(storage, SupabaseStorage):
        for i in range(0, len(keys), 100):
            res = storage.http.request("DELETE", f"{storage.base}/object/{storage.bucket}", json={"prefixes": keys[i : i + 100]})
            storage._check(res, "bulk delete")
    else:
        for k in keys:
            storage.delete(k)
    print(f"· deleted {len(to_delete)} generated resources and their files")

    left = db.scalar(select(func.count(Resource.id)).where(Resource.subject_id.in_(old_ids))) if old_ids else 0
    assert left == 0, "resources still attached to old subjects"
    for s in old_subjects:
        db.delete(s)
    db.commit()
    print(f"· deleted old demo subjects {[s.code for s in old_subjects]}")

    for u in fake:
        db.delete(u)
    db.commit()
    print(f"· deleted {len(fake)} fake demo accounts")

    for r, *_ in moves:
        refresh_counters(db, r)
    db.commit()

    cse = db.scalar(select(Branch).where(Branch.code == "CSE"))
    sanjith = db.scalar(select(User).where(User.username == "sanjith"))
    if sanjith:
        sanjith.branch_id, sanjith.current_year, sanjith.current_semester, sanjith.regulation = cse.id, 3, 1, regulation_for_year(3)
        sanjith.college = "GRIET"
    for u in real:
        u.college = "GRIET"
    db.commit()

    official = ensure_user(
        db, SYLLABUS_USERNAME, email="syllabus@studyvault.dev", full_name="Official GRIET syllabus",
        password_hash=hash_password(get_settings().secret_key + SYLLABUS_USERNAME), college="GRIET",
    )
    print("· official syllabus documents")
    print(f"   added {seed_excerpts(db, args.pdf_dir, official)}")

    print(
        f"Done: {db.scalar(select(func.count(Subject.id)))} courses, {db.scalar(select(func.count(Resource.id)))} resources, "
        f"{db.scalar(select(func.count(User.id)))} users ({', '.join(db.scalars(select(User.username).order_by(User.id)))})."
    )


if __name__ == "__main__":
    sys.exit(main())
