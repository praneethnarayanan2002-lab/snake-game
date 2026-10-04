import re
from dataclasses import dataclass

from sqlalchemy import Float, and_, case, cast, func, literal, or_, select
from sqlalchemy.orm import Session

from app.models import Resource, ResourceText, Subject, Unit, User
from app.schemas import ResourceOut
from app.services.query_parser import ParsedQuery, SubjectRef, parse_query
from app.services.ranking import Candidate, GlobalStats, bayesian_rating, score_candidates
from app.services.resources import resource_query, to_out, viewer_states

MAX_CANDIDATES = 1500
SORTS = {"best", "newest", "stars", "rating", "views"}


@dataclass
class Filters:
    subject_id: int | None = None
    subject_ids: list[int] | None = None
    unit_id: int | None = None
    unit_number: int | None = None
    resource_type: str | None = None
    year: int | None = None
    exam_type: str | None = None
    uploaded_by: int | None = None
    exclude_ids: list[int] | None = None


def load_subject_refs(db: Session) -> list[SubjectRef]:
    return [
        SubjectRef(s.id, s.slug, s.code, s.name, [a.strip() for a in s.aliases.split(",") if a.strip()])
        for s in db.scalars(select(Subject))
    ]


def _terms(keywords: list[str]) -> list[str]:
    terms = [re.sub(r"[^a-z0-9]", "", k.lower()) for k in keywords]
    return list(dict.fromkeys(t for t in terms if t))


def _tsquery_string(keywords: list[str]) -> str | None:
    terms = _terms(keywords)
    return " | ".join(f"{t}:*" for t in terms) if terms else None


def global_stats(db: Session) -> GlobalStats:
    max_stars, max_views = db.execute(
        select(func.coalesce(func.max(Resource.star_count), 0), func.coalesce(func.max(Resource.view_count), 0))
    ).one()
    return GlobalStats(max_stars=max_stars, max_views=max_views)


def _apply_filters(stmt, f: Filters):
    if f.subject_id:
        stmt = stmt.where(Resource.subject_id == f.subject_id)
    if f.subject_ids:
        stmt = stmt.where(Resource.subject_id.in_(f.subject_ids))
    if f.unit_id:
        stmt = stmt.where(Resource.unit_id == f.unit_id)
    if f.unit_number:
        stmt = stmt.where(Unit.number == f.unit_number)
    if f.resource_type:
        stmt = stmt.where(Resource.resource_type == f.resource_type)
    if f.year:
        stmt = stmt.where(Resource.year == f.year)
    if f.exam_type:
        stmt = stmt.where(Resource.exam_type == f.exam_type)
    if f.uploaded_by:
        stmt = stmt.where(Resource.uploaded_by == f.uploaded_by)
    if f.exclude_ids:
        stmt = stmt.where(Resource.id.not_in(f.exclude_ids))
    return stmt


@dataclass
class SearchResult:
    items: list[ResourceOut]
    total: int
    parsed: ParsedQuery


def search(
    db: Session,
    q: str,
    filters: Filters | None = None,
    sort: str = "best",
    limit: int = 20,
    offset: int = 0,
    user: User | None = None,
) -> SearchResult:
    filters = filters or Filters()
    sort = sort if sort in SORTS else "best"
    parsed = parse_query(q or "", load_subject_refs(db))
    tsq_str = _tsquery_string(parsed.keywords)

    if tsq_str:
        tsq = func.to_tsquery("english", tsq_str)
        kw_text = " ".join(parsed.keywords)
        unit_doc = func.to_tsvector("english", Unit.title + literal(" ") + Unit.topics)
        text_score = (
            0.5 * func.ts_rank_cd(Resource.search_vector, tsq, 32)
            + 0.2 * func.coalesce(func.ts_rank_cd(ResourceText.tsv, tsq, 32), 0)
            + 0.15 * func.ts_rank_cd(unit_doc, tsq, 32)
            + 0.15 * func.similarity(Resource.title, kw_text)
        )
        text_match = or_(
            Resource.search_vector.op("@@")(tsq),
            ResourceText.tsv.op("@@")(tsq),
            unit_doc.op("@@")(tsq),
            func.similarity(Resource.title, kw_text) > 0.3,
        )
        # Fraction of distinct keywords found anywhere, so "bankers algorithm" prefers
        # documents with both words over ones that just say "algorithm" a lot.
        full_doc = Resource.search_vector.op("||")(func.coalesce(ResourceText.tsv, func.to_tsvector(""))).op("||")(unit_doc)
        terms = _terms(parsed.keywords)[:8]
        coverage = sum(
            (case((full_doc.op("@@")(func.to_tsquery("english", f"{t}:*")), 1.0), else_=0.0) for t in terms),
            literal(0.0),
        ) / max(len(terms), 1)
    else:
        text_score = literal(0.0)
        text_match = None
        coverage = literal(0.0)

    stmt = (
        select(
            Resource.id,
            Resource.subject_id,
            Unit.number,
            Resource.resource_type,
            Resource.year,
            Resource.exam_type,
            Resource.star_count,
            Resource.view_count,
            Resource.average_rating,
            Resource.rating_count,
            Resource.created_at,
            cast(text_score, Float).label("text_score"),
            cast(coverage, Float).label("coverage"),
        )
        .join(Unit, Unit.id == Resource.unit_id)
        .outerjoin(ResourceText, ResourceText.resource_id == Resource.id)
    )
    stmt = _apply_filters(stmt, filters)

    # A query naming a subject should still surface that subject's material even if
    # no keyword matches; otherwise keywords must hit something.
    conditions = []
    if text_match is not None:
        conditions.append(text_match)
    if parsed.subject is not None and not filters.subject_id:
        conditions.append(Resource.subject_id == parsed.subject.id)
    if text_match is None and parsed.subject is None and parsed.facet_count:
        facet_conds = []
        if parsed.unit_number:
            facet_conds.append(Unit.number == parsed.unit_number)
        if parsed.resource_type:
            facet_conds.append(Resource.resource_type == parsed.resource_type)
        if parsed.year:
            facet_conds.append(Resource.year == parsed.year)
        if parsed.exam_type:
            facet_conds.append(Resource.exam_type == parsed.exam_type)
        conditions.append(and_(*facet_conds))
    if conditions:
        stmt = stmt.where(or_(*conditions))
    stmt = stmt.limit(MAX_CANDIDATES)

    candidates = [Candidate(*row) for row in db.execute(stmt)]
    scores = score_candidates(candidates, parsed, global_stats(db))

    if sort == "newest":
        candidates.sort(key=lambda c: c.created_at, reverse=True)
    elif sort == "stars":
        candidates.sort(key=lambda c: (c.star_count, c.view_count), reverse=True)
    elif sort == "rating":
        candidates.sort(key=lambda c: (bayesian_rating(c.average_rating, c.rating_count), c.star_count), reverse=True)
    elif sort == "views":
        candidates.sort(key=lambda c: c.view_count, reverse=True)
    else:
        candidates.sort(key=lambda c: (scores[c.id].total, c.star_count), reverse=True)

    page_ids = [c.id for c in candidates[offset : offset + limit]]
    rows = {r.id: r for r in db.scalars(resource_query().where(Resource.id.in_(page_ids)))} if page_ids else {}
    states = viewer_states(db, user, page_ids)
    items = [
        to_out(
            rows[rid],
            states[rid] if user else None,
            scores[rid].as_dict(),
            recommended=(sort == "best" and offset == 0 and i == 0),
        )
        for i, rid in enumerate(page_ids)
    ]
    return SearchResult(items=items, total=len(candidates), parsed=parsed)
