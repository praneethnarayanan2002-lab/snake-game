from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.constants import EXAM_RESOURCE_TYPES
from app.models import Subject, Unit
from app.routes.deps import DB, OptionalUser
from app.schemas import ResourceOut, SearchOut
from app.services.search import Filters, search

router = APIRouter(prefix="/api", tags=["search"])


def resolve_subject(db, subject: str | None) -> Subject | None:
    if not subject:
        return None
    stmt = select(Subject).where(Subject.id == int(subject)) if subject.isdigit() else select(Subject).where(Subject.slug == subject)
    found = db.scalar(stmt)
    if not found:
        raise HTTPException(404, "Subject not found")
    return found


@router.get("/search", response_model=SearchOut)
def search_resources(
    db: DB,
    user: OptionalUser,
    q: str = "",
    subject: str | None = Query(None, description="Subject slug or id"),
    unit: int | None = Query(None, ge=1, le=12, description="Unit number"),
    type: str | None = None,
    year: int | None = None,
    exam_type: str | None = None,
    uploader: int | None = None,
    sort: str = "best",
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    subj = resolve_subject(db, subject)
    filters = Filters(
        subject_id=subj.id if subj else None,
        unit_number=unit,
        resource_type=type or None,
        year=year,
        exam_type=exam_type or None,
        uploaded_by=uploader,
    )
    result = search(db, q.strip()[:200], filters, sort, limit, offset, user)
    return SearchOut(items=result.items, total=result.total, parsed=result.parsed.to_dict(), sort=sort, limit=limit, offset=offset)


@router.get("/trending", response_model=list[ResourceOut])
def trending(db: DB, user: OptionalUser, limit: int = Query(8, ge=1, le=24)):
    return search(db, "", Filters(), "best", limit, 0, user).items


@router.get("/exam-plan")
def exam_plan(
    db: DB,
    user: OptionalUser,
    subject: str = Query(...),
    exam: str = Query("semester", pattern="^(semester|mid1|mid2)$"),
    focus_unit: int | None = Query(None, ge=1, le=12),
):
    """Curated preparation path for an upcoming exam, built from the ranking engine."""
    subj = resolve_subject(db, subject)
    units = list(db.scalars(select(Unit).where(Unit.subject_id == subj.id).order_by(Unit.number)))
    # Mid 1 usually covers the first half of the syllabus, Mid 2 the second.
    if exam == "mid1":
        scope = [u.number for u in units[: max(len(units) // 2 + 1, 1)]]
    elif exam == "mid2":
        scope = [u.number for u in units[len(units) // 2 :]]
    else:
        scope = [u.number for u in units]
    paper_type = "semester" if exam == "semester" else "mid"
    base = Filters(subject_id=subj.id)

    def top(q: str, f: Filters, n: int):
        return [r for r in search(db, q, f, "best", n * 3, 0, user).items if r.unit.number in scope][:n]

    pyq_types = ["pyq", paper_type]
    pyqs = []
    for t in pyq_types:
        pyqs += top("", Filters(subject_id=subj.id, resource_type=t), 4)
    pyqs = sorted({r.id: r for r in pyqs}.values(), key=lambda r: (r.star_count, r.average_rating), reverse=True)[:4]

    banks = top("", Filters(subject_id=subj.id, resource_type="question_bank"), 4)
    faq = top("important frequently asked questions", base, 6)
    faq = [r for r in faq if r.id not in {p.id for p in pyqs} | {b.id for b in banks}][:3]

    if focus_unit is None or focus_unit not in scope:
        # Default to the in-scope unit with the most community activity.
        unit_scores: dict[int, int] = {}
        for r in search(db, "", base, "stars", 100, 0, None).items:
            if r.unit.number in scope:
                unit_scores[r.unit.number] = unit_scores.get(r.unit.number, 0) + r.star_count
        focus_unit = max(unit_scores, key=unit_scores.get) if unit_scores else (scope[0] if scope else 1)
    notes = top("", Filters(subject_id=subj.id, resource_type="notes", unit_number=focus_unit), 3)
    focus = next((u for u in units if u.number == focus_unit), None)

    steps = [
        {"key": "pyq", "title": "Most important PYQs", "subtitle": "Highest-rated past papers for this exam", "items": pyqs},
        {"key": "faq", "title": "Frequently asked questions", "subtitle": "Topics that keep coming back", "items": faq},
        {
            "key": "notes",
            "title": f"Best Unit {focus_unit} notes",
            "subtitle": focus.title if focus else "",
            "items": notes,
        },
        {"key": "bank", "title": "Important question bank", "subtitle": "Practice until it's muscle memory", "items": banks},
    ]
    return {
        "subject": {"id": subj.id, "slug": subj.slug, "code": subj.code, "name": subj.name},
        "exam": exam,
        "exam_label": {"semester": "Semester Examination", "mid1": "Mid 1 Examination", "mid2": "Mid 2 Examination"}[exam],
        "scope_units": scope,
        "focus_unit": focus_unit,
        "paper_types": sorted(EXAM_RESOURCE_TYPES),
        "steps": steps,
    }
