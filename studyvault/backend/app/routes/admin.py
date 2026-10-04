from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.models import Report, Resource, Subject, Unit, User
from app.routes.deps import DB, AdminUser
from app.routes.subjects import subject_out
from app.schemas import ReportUpdate, SubjectIn, SubjectOut, UnitIn, Uploader
from app.services.resources import delete_resource, resource_query, serialize, to_out
from app.services.search import invalidate_subject_refs

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/overview")
def overview(db: DB, _: AdminUser):
    return {
        "resources": db.scalar(select(func.count(Resource.id))),
        "users": db.scalar(select(func.count(User.id))),
        "open_reports": db.scalar(select(func.count(Report.id)).where(Report.status == "open")),
        "views": db.scalar(select(func.coalesce(func.sum(Resource.view_count), 0))),
    }


@router.get("/resources")
def admin_resources(
    db: DB, admin: AdminUser, q: str = "", limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)
):
    stmt = resource_query().order_by(Resource.created_at.desc())
    count_stmt = select(func.count(Resource.id))
    if q:
        stmt = stmt.where(Resource.title.ilike(f"%{q}%"))
        count_stmt = count_stmt.where(Resource.title.ilike(f"%{q}%"))
    rows = list(db.scalars(stmt.limit(limit).offset(offset)))
    return {"items": serialize(db, rows, admin), "total": db.scalar(count_stmt)}


@router.get("/reports")
def reports(db: DB, _: AdminUser, status_: str = Query("open", alias="status")):
    stmt = (
        select(Report)
        .options(selectinload(Report.reporter))
        .order_by(Report.created_at.desc())
    )
    if status_ != "all":
        stmt = stmt.where(Report.status == status_)
    items = list(db.scalars(stmt))
    resources = {r.id: r for r in db.scalars(resource_query().where(Resource.id.in_({i.resource_id for i in items})))} if items else {}
    open_counts = dict(
        db.execute(select(Report.resource_id, func.count()).where(Report.status == "open").group_by(Report.resource_id)).all()
    )
    return [
        {
            "id": i.id,
            "reason": i.reason,
            "details": i.details,
            "status": i.status,
            "created_at": i.created_at,
            "reporter": Uploader.model_validate(i.reporter),
            "resource": to_out(resources[i.resource_id]) if i.resource_id in resources else None,
            "open_reports_for_resource": open_counts.get(i.resource_id, 0),
        }
        for i in items
    ]


@router.patch("/reports/{report_id}")
def update_report(report_id: int, body: ReportUpdate, db: DB, _: AdminUser):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    report.status = body.status
    db.commit()
    return {"ok": True}


@router.delete("/resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete(resource_id: int, db: DB, _: AdminUser):
    r = db.get(Resource, resource_id)
    if not r:
        raise HTTPException(404, "Resource not found")
    delete_resource(db, r)


@router.post("/users/{user_id}/purge", status_code=status.HTTP_200_OK)
def purge_spammer(user_id: int, db: DB, admin: AdminUser):
    """Remove every upload by a spam account."""
    if user_id == admin.id:
        raise HTTPException(400, "You cannot purge your own uploads")
    rows = list(db.scalars(select(Resource).where(Resource.uploaded_by == user_id)))
    for r in rows:
        delete_resource(db, r)
    return {"deleted": len(rows)}


def _subject(db, subject_id: int) -> Subject:
    invalidate_subject_refs()
    s = db.scalar(select(Subject).options(selectinload(Subject.units)).where(Subject.id == subject_id))
    if not s:
        raise HTTPException(404, "Subject not found")
    return s


@router.post("/subjects", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def create_subject(body: SubjectIn, db: DB, _: AdminUser):
    s = Subject(**body.model_dump())
    db.add(s)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "A subject with that code or slug already exists") from exc
    return subject_out(db, [_subject(db, s.id)])[0]


@router.patch("/subjects/{subject_id}", response_model=SubjectOut)
def update_subject(subject_id: int, body: SubjectIn, db: DB, _: AdminUser):
    s = _subject(db, subject_id)
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "A subject with that code or slug already exists") from exc
    return subject_out(db, [_subject(db, s.id)])[0]


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(subject_id: int, db: DB, _: AdminUser):
    s = _subject(db, subject_id)
    if db.scalar(select(func.count(Resource.id)).where(Resource.subject_id == s.id)):
        raise HTTPException(409, "Move or delete this subject's resources first")
    db.delete(s)
    db.commit()


@router.post("/subjects/{subject_id}/units", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def add_unit(subject_id: int, body: UnitIn, db: DB, _: AdminUser):
    s = _subject(db, subject_id)
    db.add(Unit(subject_id=s.id, **body.model_dump()))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, f"Unit {body.number} already exists") from exc
    db.expire_all()
    return subject_out(db, [_subject(db, s.id)])[0]


@router.patch("/units/{unit_id}", response_model=SubjectOut)
def update_unit(unit_id: int, body: UnitIn, db: DB, _: AdminUser):
    u = db.get(Unit, unit_id)
    if not u:
        raise HTTPException(404, "Unit not found")
    for k, v in body.model_dump().items():
        setattr(u, k, v)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, f"Unit {body.number} already exists") from exc
    db.expire_all()
    return subject_out(db, [_subject(db, u.subject_id)])[0]


@router.delete("/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_unit(unit_id: int, db: DB, _: AdminUser):
    u = db.get(Unit, unit_id)
    if not u:
        raise HTTPException(404, "Unit not found")
    if db.scalar(select(func.count(Resource.id)).where(Resource.unit_id == u.id)):
        raise HTTPException(409, "This unit still has resources")
    db.delete(u)
    db.commit()
