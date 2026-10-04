from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.models import Bookmark, Resource, ResourceView, Subject, User
from app.routes.deps import DB, CurrentUser, OptionalUser
from app.schemas import ResourceOut, SubjectBrief, UserPublic
from app.services.resources import resource_query, serialize
from app.services.search import Filters, search

router = APIRouter(prefix="/api", tags=["users"])


def _user_stats(db, user_id: int) -> dict:
    uploads, stars, views = db.execute(
        select(
            func.count(Resource.id),
            func.coalesce(func.sum(Resource.star_count), 0),
            func.coalesce(func.sum(Resource.view_count), 0),
        ).where(Resource.uploaded_by == user_id)
    ).one()
    bookmarks = db.scalar(select(func.count()).where(Bookmark.user_id == user_id)) or 0
    return {"uploads": uploads, "stars_received": stars, "views_received": views, "bookmarks": bookmarks}


@router.get("/users/{username}")
def public_profile(username: str, db: DB, viewer: OptionalUser):
    user = db.scalar(select(User).where(User.username == username.lower()))
    if not user:
        raise HTTPException(404, "User not found")
    stats = _user_stats(db, user.id)
    stats.pop("bookmarks")
    uploads = search(db, "", Filters(uploaded_by=user.id), "stars", 50, 0, viewer).items
    return {"user": UserPublic.model_validate(user), "stats": stats, "uploads": uploads}


@router.get("/me/uploads", response_model=list[ResourceOut])
def my_uploads(db: DB, user: CurrentUser):
    rows = db.scalars(resource_query().where(Resource.uploaded_by == user.id).order_by(Resource.created_at.desc()))
    return serialize(db, list(rows), user)


@router.get("/me/bookmarks", response_model=list[ResourceOut])
def my_bookmarks(db: DB, user: CurrentUser):
    rows = db.scalars(
        resource_query().join(Bookmark, Bookmark.resource_id == Resource.id).where(Bookmark.user_id == user.id).order_by(Bookmark.created_at.desc())
    )
    return serialize(db, list(rows), user)


def _recent(db, user: User, limit: int) -> list[dict]:
    latest = (
        select(ResourceView.resource_id, func.max(ResourceView.viewed_at).label("viewed_at"))
        .where(ResourceView.user_id == user.id)
        .group_by(ResourceView.resource_id)
        .order_by(func.max(ResourceView.viewed_at).desc())
        .limit(limit)
        .subquery()
    )
    rows = db.execute(
        select(latest.c.resource_id, latest.c.viewed_at, ResourceView.last_page)
        .join(ResourceView, (ResourceView.resource_id == latest.c.resource_id) & (ResourceView.viewed_at == latest.c.viewed_at))
        .where(ResourceView.user_id == user.id)
        .order_by(latest.c.viewed_at.desc())
    ).all()
    ids = [r.resource_id for r in rows]
    resources = {r.id: r for r in serialize(db, list(db.scalars(resource_query().where(Resource.id.in_(ids)))), user)} if ids else {}
    return [
        {"resource": resources[r.resource_id], "viewed_at": r.viewed_at, "last_page": r.last_page}
        for r in rows
        if r.resource_id in resources
    ]


@router.get("/me/recent")
def recent(db: DB, user: CurrentUser, limit: int = Query(10, ge=1, le=50)):
    return _recent(db, user, limit)


@router.get("/me/dashboard")
def dashboard(db: DB, user: CurrentUser):
    recent_items = _recent(db, user, 6)

    # "Your subjects": anything the user has opened, bookmarked or uploaded, by activity.
    activity: dict[int, int] = {}
    for sid, n in db.execute(
        select(Resource.subject_id, func.count()).join(ResourceView, ResourceView.resource_id == Resource.id).where(ResourceView.user_id == user.id).group_by(Resource.subject_id)
    ):
        activity[sid] = activity.get(sid, 0) + n
    for sid, n in db.execute(
        select(Resource.subject_id, func.count()).join(Bookmark, Bookmark.resource_id == Resource.id).where(Bookmark.user_id == user.id).group_by(Resource.subject_id)
    ):
        activity[sid] = activity.get(sid, 0) + 2 * n
    for sid, n in db.execute(select(Resource.subject_id, func.count()).where(Resource.uploaded_by == user.id).group_by(Resource.subject_id)):
        activity[sid] = activity.get(sid, 0) + 3 * n
    subject_ids = sorted(activity, key=activity.get, reverse=True)
    subjects = [SubjectBrief.model_validate(s) for s in db.scalars(select(Subject).where(Subject.id.in_(subject_ids)))] if subject_ids else []
    subjects.sort(key=lambda s: subject_ids.index(s.id))

    seen = [r["resource"].id for r in recent_items]
    recommended = search(
        db, "", Filters(subject_ids=subject_ids or None, exclude_ids=seen or None), "best", 6, 0, user
    ).items
    for r in recommended:
        r.recommended = False

    bookmarks = my_bookmarks(db, user)[:6]
    uploads = my_uploads(db, user)[:6]
    popular = search(db, "", Filters(), "stars", 6, 0, user).items

    return {
        "user": UserPublic.model_validate(user),
        "stats": _user_stats(db, user.id),
        "recent": recent_items,
        "recommended": recommended,
        "subjects": subjects,
        "bookmarks": bookmarks,
        "uploads": uploads,
        "popular": popular,
    }
