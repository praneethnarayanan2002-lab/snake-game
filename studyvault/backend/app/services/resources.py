import re
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.constants import EXAM_TYPES, RESOURCE_TYPES
from app.models import Bookmark, Report, Resource, ResourceRating, ResourceStar, Tag, User
from app.schemas import ResourceOut, SubjectBrief, UnitBrief, Uploader, ViewerState
from app.services.storage import get_storage


def resource_query():
    return select(Resource).options(
        selectinload(Resource.subject),
        selectinload(Resource.unit),
        selectinload(Resource.uploader),
        selectinload(Resource.tags),
    )


def normalize_tags(raw: Sequence[str] | str) -> list[str]:
    items = re.split(r"[,#\n]", raw) if isinstance(raw, str) else list(raw)
    seen: list[str] = []
    for item in items:
        tag = re.sub(r"[^a-z0-9+\- ]", "", item.strip().lower()).strip()[:48]
        if tag and tag not in seen:
            seen.append(tag)
    return seen[:12]


def set_tags(db: Session, resource: Resource, names: Sequence[str]) -> None:
    names = normalize_tags(names)
    existing = {t.name: t for t in db.scalars(select(Tag).where(Tag.name.in_(names)))} if names else {}
    new = [Tag(name=n) for n in names if n not in existing]
    if new:
        # Flush now so later set_tags calls in the same transaction can find these rows.
        db.add_all(new)
        db.flush(new)
        existing.update({t.name: t for t in new})
    resource.tags = [existing[n] for n in names]
    resource.tags_text = " ".join(names)


def viewer_states(db: Session, user: User | None, ids: list[int]) -> dict[int, ViewerState]:
    states = {i: ViewerState() for i in ids}
    if not user or not ids:
        return states
    for rid in db.scalars(select(ResourceStar.resource_id).where(ResourceStar.user_id == user.id, ResourceStar.resource_id.in_(ids))):
        states[rid].starred = True
    for rid in db.scalars(select(Bookmark.resource_id).where(Bookmark.user_id == user.id, Bookmark.resource_id.in_(ids))):
        states[rid].bookmarked = True
    for rid, rating in db.execute(
        select(ResourceRating.resource_id, ResourceRating.rating).where(
            ResourceRating.user_id == user.id, ResourceRating.resource_id.in_(ids)
        )
    ):
        states[rid].my_rating = rating
    for rid in db.scalars(select(Report.resource_id).where(Report.user_id == user.id, Report.resource_id.in_(ids))):
        states[rid].reported = True
    return states


def to_out(r: Resource, viewer: ViewerState | None = None, score: dict | None = None, recommended: bool = False) -> ResourceOut:
    return ResourceOut(
        id=r.id,
        title=r.title,
        description=r.description,
        file_url=r.file_url,
        file_name=r.file_name,
        file_size=r.file_size,
        page_count=r.page_count,
        subject=SubjectBrief.model_validate(r.subject),
        unit=UnitBrief.model_validate(r.unit),
        resource_type=r.resource_type,
        resource_type_label=RESOURCE_TYPES.get(r.resource_type, r.resource_type),
        year=r.year,
        exam_type=r.exam_type,
        exam_type_label=EXAM_TYPES.get(r.exam_type) if r.exam_type else None,
        uploader=Uploader.model_validate(r.uploader),
        view_count=r.view_count,
        star_count=r.star_count,
        rating_count=r.rating_count,
        average_rating=round(r.average_rating, 2),
        bookmark_count=r.bookmark_count,
        tags=[t.name for t in r.tags],
        created_at=r.created_at,
        viewer=viewer,
        score=score,
        recommended=recommended,
    )


def serialize(db: Session, resources: Sequence[Resource], user: User | None) -> list[ResourceOut]:
    states = viewer_states(db, user, [r.id for r in resources])
    return [to_out(r, states[r.id] if user else None) for r in resources]


def refresh_counters(db: Session, resource: Resource) -> None:
    """Recompute denormalised counters from the source-of-truth tables."""
    resource.star_count = db.scalar(select(func.count()).where(ResourceStar.resource_id == resource.id)) or 0
    resource.bookmark_count = db.scalar(select(func.count()).where(Bookmark.resource_id == resource.id)) or 0
    count, avg = db.execute(
        select(func.count(ResourceRating.id), func.coalesce(func.avg(ResourceRating.rating), 0)).where(
            ResourceRating.resource_id == resource.id
        )
    ).one()
    resource.rating_count = count
    resource.average_rating = float(avg)


def delete_resource(db: Session, resource: Resource) -> None:
    key = resource.file_key
    db.delete(resource)
    db.commit()
    get_storage().delete(key)
