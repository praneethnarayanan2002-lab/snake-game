from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.constants import CURRENT_REGULATION_BY_YEAR, EXAM_TYPES, REGULATIONS, REPORT_REASONS, RESOURCE_TYPES
from app.models import Branch, Resource, Subject, SubjectOffering, Unit
from app.routes.deps import DB
from app.schemas import BranchOut, OfferingOut, SubjectListItem, SubjectOut, UnitOut
from app.services.documents import FORMATS
from app.services.storage import get_storage

router = APIRouter(prefix="/api", tags=["subjects"])


def _lines(text: str) -> list[str]:
    return [line for line in (text or "").split("\n") if line.strip()]


def subject_out(db: Session, subjects: list[Subject]) -> list[SubjectOut]:
    ids = [s.id for s in subjects]
    unit_stats = {
        uid: (count, stars)
        for uid, count, stars in db.execute(
            select(Resource.unit_id, func.count(), func.coalesce(func.sum(Resource.star_count), 0))
            .where(Resource.subject_id.in_(ids))
            .group_by(Resource.unit_id)
        )
    }
    subject_stats = {
        sid: (count, stars)
        for sid, count, stars in db.execute(
            select(Resource.subject_id, func.count(), func.coalesce(func.sum(Resource.star_count), 0))
            .where(Resource.subject_id.in_(ids))
            .group_by(Resource.subject_id)
        )
    }
    out = []
    for s in subjects:
        count, stars = subject_stats.get(s.id, (0, 0))
        out.append(
            SubjectOut(
                id=s.id,
                slug=s.slug,
                code=s.code,
                name=s.name,
                course_code=s.course_code,
                regulation=s.regulation,
                year=s.year,
                semester=s.semester,
                kind=s.kind,
                credits=s.credits,
                ltpc=s.ltpc,
                description=s.description,
                aliases=s.aliases,
                resource_count=count,
                star_count=stars,
                unit_count=len(s.units),
                units=[
                    UnitOut(
                        id=u.id,
                        number=u.number,
                        title=u.title,
                        topics=u.topics,
                        resource_count=unit_stats.get(u.id, (0, 0))[0],
                        star_count=unit_stats.get(u.id, (0, 0))[1],
                    )
                    for u in s.units
                ],
                outcomes=_lines(s.outcomes),
                books=_lines(s.books),
                lab_tasks=s.lab_tasks,
                source_url=s.source_url,
                offerings=sorted(
                    (
                        OfferingOut(branch_code=o.branch.code, branch_name=o.branch.name, year=o.year, semester=o.semester, elective=o.elective)
                        for o in s.offerings
                    ),
                    key=lambda o: o.branch_code,
                ),
            )
        )
    return out


def _detail_query():
    return select(Subject).options(
        selectinload(Subject.units), selectinload(Subject.offerings).selectinload(SubjectOffering.branch)
    )


@router.get("/meta")
def meta(db: DB):
    return {
        "resource_types": RESOURCE_TYPES,
        "exam_types": EXAM_TYPES,
        "report_reasons": REPORT_REASONS,
        "direct_upload": get_storage().supports_direct_upload,
        "formats": {ext: {"kind": f.kind, "label": f.label, "mime": f.mime} for ext, f in FORMATS.items()},
        "max_upload_mb": get_settings().max_upload_mb,
        "regulations": REGULATIONS,
        "current_regulations": CURRENT_REGULATION_BY_YEAR,
        "branches": [{"code": b.code, "name": b.name} for b in db.scalars(select(Branch).order_by(Branch.id))],
    }


@router.get("/branches", response_model=list[BranchOut])
def branches(db: DB):
    counts = dict(db.execute(select(SubjectOffering.branch_id, func.count()).group_by(SubjectOffering.branch_id)).all())
    return [BranchOut(code=b.code, name=b.name, subject_count=counts.get(b.id, 0)) for b in db.scalars(select(Branch).order_by(Branch.id))]


@router.get("/subjects", response_model=list[SubjectListItem])
def list_subjects(
    db: DB,
    regulation: str | None = None,
    branch: str | None = None,
    year: int | None = Query(None, ge=1, le=4),
    semester: int | None = Query(None, ge=1, le=2),
    kind: str | None = Query(None, pattern="^(theory|lab|project)$"),
    q: str = "",
    limit: int = Query(300, ge=1, le=2000),
):
    """Courses, optionally scoped to a regulation / branch / semester. When a branch is
    given, year/semester/elective come from that branch's programme structure."""
    stmt = select(Subject, SubjectOffering).outerjoin(SubjectOffering, SubjectOffering.subject_id == Subject.id) if branch else select(Subject, None)
    if branch:
        stmt = stmt.join(Branch, Branch.id == SubjectOffering.branch_id).where(Branch.code == branch.upper())
        year_col, sem_col = SubjectOffering.year, SubjectOffering.semester
    else:
        year_col, sem_col = Subject.year, Subject.semester
    if regulation:
        stmt = stmt.where(Subject.regulation == regulation.upper())
    if year:
        stmt = stmt.where(year_col == year)
    if semester:
        stmt = stmt.where(sem_col == semester)
    if kind:
        stmt = stmt.where(Subject.kind == kind)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Subject.name.ilike(like), Subject.code.ilike(like), Subject.course_code.ilike(like), Subject.aliases.ilike(like)))
    stmt = stmt.order_by(year_col.nulls_last(), sem_col.nulls_last(), Subject.kind.desc(), Subject.name).limit(limit)
    rows = db.execute(stmt).all()

    ids = [s.id for s, _ in rows]
    res_counts = dict(db.execute(select(Resource.subject_id, func.count()).where(Resource.subject_id.in_(ids)).group_by(Resource.subject_id)).all()) if ids else {}
    unit_counts = dict(db.execute(select(Unit.subject_id, func.count()).where(Unit.subject_id.in_(ids)).group_by(Unit.subject_id)).all()) if ids else {}
    return [
        SubjectListItem(
            id=s.id,
            slug=s.slug,
            code=s.code,
            name=s.name,
            course_code=s.course_code,
            regulation=s.regulation,
            year=o.year if o else s.year,
            semester=o.semester if o else s.semester,
            elective=o.elective if o else None,
            kind=s.kind,
            credits=s.credits,
            ltpc=s.ltpc,
            resource_count=res_counts.get(s.id, 0),
            unit_count=unit_counts.get(s.id, 0),
        )
        for s, o in rows
    ]


@router.get("/subjects/lookup")
def lookup(db: DB, q: str = Query(..., min_length=1, max_length=80), regulation: str | None = None):
    """Typeahead for the command palette: matching courses and units."""
    like = f"%{q.strip()}%"
    subj_stmt = select(Subject).where(
        or_(Subject.name.ilike(like), Subject.code.ilike(like), Subject.course_code.ilike(like), Subject.aliases.ilike(like))
    )
    unit_stmt = select(Unit, Subject).join(Subject, Subject.id == Unit.subject_id).where(Unit.title.ilike(like), Subject.kind == "theory")
    if regulation:
        subj_stmt = subj_stmt.where(Subject.regulation == regulation)
        unit_stmt = unit_stmt.where(Subject.regulation == regulation)
    subjects = list(db.scalars(subj_stmt.order_by(func.length(Subject.name), Subject.regulation.desc()).limit(6)))
    units = db.execute(unit_stmt.order_by(Subject.regulation.desc()).limit(5)).all()
    return {
        "subjects": [
            {"slug": s.slug, "code": s.code, "name": s.name, "course_code": s.course_code, "regulation": s.regulation, "year": s.year, "semester": s.semester, "kind": s.kind}
            for s in subjects
        ],
        "units": [
            {"subject_slug": s.slug, "subject_code": s.code, "subject_name": s.name, "regulation": s.regulation, "number": u.number, "title": u.title}
            for u, s in units
        ],
    }


@router.get("/subjects/{slug}", response_model=SubjectOut)
def get_subject(slug: str, db: DB):
    subject = db.scalar(_detail_query().where(Subject.slug == slug))
    if not subject:
        raise HTTPException(404, "Subject not found")
    return subject_out(db, [subject])[0]
