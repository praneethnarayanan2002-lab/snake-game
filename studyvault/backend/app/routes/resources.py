import io
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert

from app.config import get_settings
from app.constants import EXAM_TYPES, REPORT_REASONS, RESOURCE_TYPES
from app.models import Bookmark, Report, Resource, ResourceRating, ResourceStar, ResourceText, ResourceView, Unit, User
from app.routes.deps import DB, CurrentUser, OptionalUser
from app.schemas import ProgressIn, RatingIn, ReportIn, ResourceOut, ResourceUpdate, StatsOut
from app.services.pdf_text import InvalidPdf, extract_pdf
from app.services.resources import delete_resource, refresh_counters, resource_query, serialize, set_tags, viewer_states
from app.services.storage import StorageError, get_storage

router = APIRouter(prefix="/api/resources", tags=["resources"])

VIEW_DEDUPE_WINDOW = timedelta(minutes=30)


def _get(db, resource_id: int) -> Resource:
    r = db.scalar(resource_query().where(Resource.id == resource_id))
    if not r:
        raise HTTPException(404, "Resource not found")
    return r


def _validate_meta(db, subject_id: int, unit_id: int, resource_type: str, exam_type: str | None) -> None:
    if resource_type not in RESOURCE_TYPES:
        raise HTTPException(422, "Unknown resource type")
    if exam_type and exam_type not in EXAM_TYPES:
        raise HTTPException(422, "Unknown exam type")
    unit = db.get(Unit, unit_id)
    if not unit or unit.subject_id != subject_id:
        raise HTTPException(422, "Unit does not belong to the selected subject")


def _stats(db, r: Resource, user: User | None) -> StatsOut:
    db.refresh(r)
    return StatsOut(
        star_count=r.star_count,
        rating_count=r.rating_count,
        average_rating=round(r.average_rating, 2),
        bookmark_count=r.bookmark_count,
        view_count=r.view_count,
        viewer=viewer_states(db, user, [r.id])[r.id],
    )


class UploadUrlIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0)


def _max_bytes() -> int:
    return get_settings().max_upload_mb * 1024 * 1024


def _user_key_marker(user: User) -> str:
    return f"/u{user.id}-"


@router.post("/upload-url")
def create_upload_url(body: UploadUrlIn, user: CurrentUser):
    """Signed URL for uploading straight to object storage (used when the API sits behind
    a small request-size limit, e.g. Vercel functions). Finish with POST /api/resources."""
    storage = get_storage()
    if not storage.supports_direct_upload:
        raise HTTPException(400, "Direct upload is not available; send the file to POST /api/resources")
    if body.size > _max_bytes():
        raise HTTPException(413, f"PDF is larger than {get_settings().max_upload_mb} MB")
    key = storage.new_key(body.filename)
    # Tag the key with the uploader so nobody can claim someone else's object.
    folder, name = key.rsplit("/", 1)
    key = f"{folder}{_user_key_marker(user)}{name}"
    return {"key": key, "upload_url": storage.create_upload_url(key)}


@router.post("", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
def upload(
    db: DB,
    user: CurrentUser,
    title: Annotated[str, Form(min_length=3, max_length=200)],
    subject_id: Annotated[int, Form()],
    unit_id: Annotated[int, Form()],
    resource_type: Annotated[str, Form()],
    year: Annotated[int, Form(ge=1990, le=2100)],
    description: Annotated[str, Form(min_length=1, max_length=4000)],
    tags: Annotated[str, Form(min_length=1)],
    exam_type: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
    file_key: Annotated[str | None, Form(max_length=255)] = None,
    file_name: Annotated[str | None, Form(max_length=255)] = None,
):
    """Create a resource from either a multipart ``file`` or a ``file_key`` previously
    uploaded through ``/upload-url``."""
    exam_type = exam_type or None
    _validate_meta(db, subject_id, unit_id, resource_type, exam_type)
    storage = get_storage()

    if file is not None:
        size = file.size if file.size is not None else len(file.file.read())
        file.file.seek(0)
        stream, name, key = file.file, file.filename or "document.pdf", None
    elif file_key:
        if _user_key_marker(user) not in file_key or db.scalar(select(Resource.id).where(Resource.file_key == file_key)):
            raise HTTPException(403, "Invalid upload reference")
        try:
            data = storage.read(file_key)
        except StorageError as exc:
            raise HTTPException(422, "Uploaded file not found — please upload again") from exc
        stream, name, key, size = io.BytesIO(data), file_name or "document.pdf", file_key, len(data)
    else:
        raise HTTPException(422, "Attach a PDF file")

    def reject(code: int, msg: str):
        if key:
            storage.delete(key)
        raise HTTPException(code, msg)

    if size > _max_bytes():
        reject(413, f"PDF is larger than {get_settings().max_upload_mb} MB")
    if size == 0:
        reject(422, "The file is empty")
    try:
        info = extract_pdf(stream)
    except InvalidPdf as exc:
        reject(422, str(exc))

    if key is None:
        key = storage.save(stream, name)
    try:
        resource = Resource(
            title=title.strip(),
            description=description.strip(),
            file_key=key,
            file_name=name,
            file_size=size,
            page_count=info.page_count,
            subject_id=subject_id,
            unit_id=unit_id,
            resource_type=resource_type,
            year=year,
            exam_type=exam_type,
            uploaded_by=user.id,
        )
        set_tags(db, resource, tags)
        resource.text = ResourceText(content=info.text)
        db.add(resource)
        db.commit()
    except Exception:
        db.rollback()
        storage.delete(key)
        raise
    return serialize(db, [_get(db, resource.id)], user)[0]


@router.get("/{resource_id}", response_model=ResourceOut)
def get_resource(resource_id: int, db: DB, user: OptionalUser):
    return serialize(db, [_get(db, resource_id)], user)[0]


@router.patch("/{resource_id}", response_model=ResourceOut)
def update_resource(resource_id: int, body: ResourceUpdate, db: DB, user: CurrentUser):
    r = _get(db, resource_id)
    if r.uploaded_by != user.id and not user.is_admin:
        raise HTTPException(403, "Only the uploader or an admin can edit this resource")
    data = body.model_dump(exclude_unset=True)
    tags = data.pop("tags", None)
    merged = {
        "subject_id": data.get("subject_id", r.subject_id),
        "unit_id": data.get("unit_id", r.unit_id),
        "resource_type": data.get("resource_type", r.resource_type),
        "exam_type": data.get("exam_type", r.exam_type) or None,
    }
    _validate_meta(db, **merged)
    for k, v in {**data, **merged}.items():
        setattr(r, k, v)
    if tags is not None:
        set_tags(db, r, tags)
    db.commit()
    db.expire_all()
    return serialize(db, [_get(db, resource_id)], user)[0]


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_resource(resource_id: int, db: DB, user: CurrentUser):
    r = _get(db, resource_id)
    if r.uploaded_by != user.id and not user.is_admin:
        raise HTTPException(403, "Only the uploader or an admin can delete this resource")
    delete_resource(db, r)


@router.get("/{resource_id}/file")
def download_file(resource_id: int, db: DB, download: bool = Query(False)):
    r = db.get(Resource, resource_id)
    if not r:
        raise HTTPException(404, "Resource not found")
    storage = get_storage()
    if url := storage.public_url(r.file_key, r.file_name if download else None):
        return RedirectResponse(url)
    path = storage.local_path(r.file_key)
    if not path or not path.is_file():
        raise HTTPException(404, "File is missing from storage")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=r.file_name,
        content_disposition_type="attachment" if download else "inline",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.post("/{resource_id}/view", response_model=StatsOut)
def record_view(resource_id: int, db: DB, user: OptionalUser):
    r = _get(db, resource_id)
    count_it = True
    if user:
        now = datetime.now(UTC)
        recent = db.scalar(
            select(ResourceView)
            .where(ResourceView.user_id == user.id, ResourceView.resource_id == r.id)
            .order_by(ResourceView.viewed_at.desc())
            .limit(1)
        )
        if recent and now - recent.viewed_at < VIEW_DEDUPE_WINDOW:
            recent.viewed_at = now
            count_it = False
        else:
            db.add(ResourceView(user_id=user.id, resource_id=r.id, last_page=recent.last_page if recent else 1))
    if count_it:
        db.execute(update(Resource).where(Resource.id == r.id).values(view_count=Resource.view_count + 1))
    db.commit()
    return _stats(db, r, user)


@router.put("/{resource_id}/progress", status_code=status.HTTP_204_NO_CONTENT)
def save_progress(resource_id: int, body: ProgressIn, db: DB, user: CurrentUser):
    view = db.scalar(
        select(ResourceView)
        .where(ResourceView.user_id == user.id, ResourceView.resource_id == resource_id)
        .order_by(ResourceView.viewed_at.desc())
        .limit(1)
    )
    if view:
        view.last_page = body.page
        db.commit()


@router.post("/{resource_id}/star", response_model=StatsOut)
def star(resource_id: int, db: DB, user: CurrentUser):
    r = _get(db, resource_id)
    db.execute(insert(ResourceStar).values(user_id=user.id, resource_id=r.id).on_conflict_do_nothing())
    refresh_counters(db, r)
    db.commit()
    return _stats(db, r, user)


@router.delete("/{resource_id}/star", response_model=StatsOut)
def unstar(resource_id: int, db: DB, user: CurrentUser):
    r = _get(db, resource_id)
    db.execute(delete(ResourceStar).where(ResourceStar.user_id == user.id, ResourceStar.resource_id == r.id))
    refresh_counters(db, r)
    db.commit()
    return _stats(db, r, user)


@router.put("/{resource_id}/rating", response_model=StatsOut)
def rate(resource_id: int, body: RatingIn, db: DB, user: CurrentUser):
    r = _get(db, resource_id)
    stmt = insert(ResourceRating).values(user_id=user.id, resource_id=r.id, rating=body.rating)
    db.execute(
        stmt.on_conflict_do_update(
            constraint="uq_rating_user_resource", set_={"rating": body.rating, "updated_at": datetime.now(UTC)}
        )
    )
    refresh_counters(db, r)
    db.commit()
    return _stats(db, r, user)


@router.delete("/{resource_id}/rating", response_model=StatsOut)
def unrate(resource_id: int, db: DB, user: CurrentUser):
    r = _get(db, resource_id)
    db.execute(delete(ResourceRating).where(ResourceRating.user_id == user.id, ResourceRating.resource_id == r.id))
    refresh_counters(db, r)
    db.commit()
    return _stats(db, r, user)


@router.post("/{resource_id}/bookmark", response_model=StatsOut)
def bookmark(resource_id: int, db: DB, user: CurrentUser):
    r = _get(db, resource_id)
    db.execute(insert(Bookmark).values(user_id=user.id, resource_id=r.id).on_conflict_do_nothing())
    refresh_counters(db, r)
    db.commit()
    return _stats(db, r, user)


@router.delete("/{resource_id}/bookmark", response_model=StatsOut)
def unbookmark(resource_id: int, db: DB, user: CurrentUser):
    r = _get(db, resource_id)
    db.execute(delete(Bookmark).where(Bookmark.user_id == user.id, Bookmark.resource_id == r.id))
    refresh_counters(db, r)
    db.commit()
    return _stats(db, r, user)


@router.post("/{resource_id}/report", status_code=status.HTTP_201_CREATED)
def report(resource_id: int, body: ReportIn, db: DB, user: CurrentUser):
    r = _get(db, resource_id)
    if body.reason not in REPORT_REASONS:
        raise HTTPException(422, "Unknown report reason")
    db.execute(
        insert(Report)
        .values(user_id=user.id, resource_id=r.id, reason=body.reason, details=body.details, status="open")
        .on_conflict_do_update(
            constraint="uq_report_user_resource", set_={"reason": body.reason, "details": body.details, "status": "open"}
        )
    )
    db.commit()
    return {"ok": True}
