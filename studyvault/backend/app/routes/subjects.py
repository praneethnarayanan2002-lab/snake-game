from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.constants import EXAM_TYPES, REPORT_REASONS, RESOURCE_TYPES
from app.models import Resource, Subject
from app.routes.deps import DB
from app.schemas import SubjectOut, UnitOut

router = APIRouter(prefix="/api", tags=["subjects"])


def subject_out(db: Session, subjects: list[Subject]) -> list[SubjectOut]:
    unit_counts = dict(db.execute(select(Resource.unit_id, func.count()).group_by(Resource.unit_id)).all())
    subject_stats = {
        sid: (count, stars)
        for sid, count, stars in db.execute(
            select(Resource.subject_id, func.count(), func.coalesce(func.sum(Resource.star_count), 0)).group_by(
                Resource.subject_id
            )
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
                description=s.description,
                resource_count=count,
                star_count=stars,
                units=[
                    UnitOut(id=u.id, number=u.number, title=u.title, topics=u.topics, resource_count=unit_counts.get(u.id, 0))
                    for u in s.units
                ],
            )
        )
    return out


@router.get("/meta")
def meta():
    return {"resource_types": RESOURCE_TYPES, "exam_types": EXAM_TYPES, "report_reasons": REPORT_REASONS}


@router.get("/subjects", response_model=list[SubjectOut])
def list_subjects(db: DB):
    subjects = list(db.scalars(select(Subject).options(selectinload(Subject.units)).order_by(Subject.id)))
    return subject_out(db, subjects)


@router.get("/subjects/{slug}", response_model=SubjectOut)
def get_subject(slug: str, db: DB):
    subject = db.scalar(select(Subject).options(selectinload(Subject.units)).where(Subject.slug == slug))
    if not subject:
        raise HTTPException(404, "Subject not found")
    return subject_out(db, [subject])[0]
