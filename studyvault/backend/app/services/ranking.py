"""Weighted ranking for search results.

The engine is deliberately split into independent signals so new ones (e.g. semantic
similarity from embeddings) can be added by computing another 0..1 score and giving
it a weight, without touching retrieval.
"""

import math
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

from app.services.query_parser import ParsedQuery


@dataclass(frozen=True)
class Weights:
    relevance: float = 0.40
    subject_unit: float = 0.20
    resource_type: float = 0.15
    popularity: float = 0.15
    rating: float = 0.10


DEFAULT_WEIGHTS = Weights()

# Bayesian prior: a resource with few ratings is pulled towards an average 3.5.
RATING_PRIOR_MEAN = 3.5
RATING_PRIOR_WEIGHT = 3
RECENCY_HALF_LIFE_DAYS = 365
# Share of the popularity signal given to freshness, so new uploads can surface.
RECENCY_SHARE = 0.15


@dataclass
class Candidate:
    id: int
    subject_id: int
    unit_number: int
    resource_type: str
    year: int
    exam_type: str | None
    star_count: int
    view_count: int
    average_rating: float
    rating_count: int
    created_at: datetime
    text_score: float = 0.0
    keyword_coverage: float = 0.0


@dataclass
class ScoreBreakdown:
    relevance: float
    subject_unit: float
    resource_type: float
    popularity: float
    rating: float
    total: float

    def as_dict(self) -> dict:
        return {k: round(v, 4) for k, v in asdict(self).items()}


@dataclass
class GlobalStats:
    max_stars: int
    max_views: int


def bayesian_rating(avg: float, count: int) -> float:
    return (RATING_PRIOR_MEAN * RATING_PRIOR_WEIGHT + avg * count) / (RATING_PRIOR_WEIGHT + count)


def _log_norm(value: int, maximum: int) -> float:
    if maximum <= 0:
        return 0.0
    return math.log1p(max(value, 0)) / math.log1p(maximum)


def _recency(created_at: datetime, now: datetime) -> float:
    age_days = max((now - created_at).total_seconds() / 86400, 0)
    return 0.5 ** (age_days / RECENCY_HALF_LIFE_DAYS)


def _facet_matches(c: Candidate, q: ParsedQuery) -> list[float]:
    checks: list[float] = []
    if q.subject is not None:
        checks.append(float(c.subject_id in q.subject.ids))
    if q.unit_number is not None:
        checks.append(float(c.unit_number == q.unit_number))
    if q.resource_type is not None:
        checks.append(float(c.resource_type == q.resource_type))
    if q.year is not None:
        checks.append(_year_match(c.year, q.year))
    if q.exam_type is not None:
        checks.append(float(c.exam_type == q.exam_type))
    return checks


def _year_match(year: int, wanted: int) -> float:
    diff = abs(year - wanted)
    return 1.0 if diff == 0 else 0.4 if diff == 1 else 0.0


def score_candidates(
    candidates: list[Candidate],
    query: ParsedQuery,
    stats: GlobalStats,
    weights: Weights = DEFAULT_WEIGHTS,
    now: datetime | None = None,
) -> dict[int, ScoreBreakdown]:
    now = now or datetime.now(UTC)
    max_text = max((c.text_score for c in candidates), default=0.0)
    has_keywords = bool(query.keywords) and max_text > 0

    out: dict[int, ScoreBreakdown] = {}
    for c in candidates:
        facets = _facet_matches(c, query)
        coverage = sum(facets) / len(facets) if facets else 0.0
        text_rel = 0.5 * (c.text_score / max_text) + 0.5 * c.keyword_coverage if has_keywords else 0.0
        # Without topical keywords, the user's intent *is* the facets, so they drive relevance.
        if has_keywords:
            relevance = 0.75 * text_rel + 0.25 * coverage if facets else text_rel
        else:
            relevance = coverage

        if query.subject is not None:
            subject_hit = float(c.subject_id in query.subject.ids)
            unit_hit = float(c.unit_number == query.unit_number) if query.unit_number is not None else subject_hit
            subject_unit = 0.5 * subject_hit + 0.5 * (unit_hit * subject_hit)
        elif query.unit_number is not None:
            subject_unit = float(c.unit_number == query.unit_number)
        else:
            subject_unit = 0.0

        if query.resource_type is not None:
            type_hit = float(c.resource_type == query.resource_type)
            type_score = 0.7 * type_hit + 0.3 * _year_match(c.year, query.year) if query.year else type_hit
        elif query.year is not None:
            type_score = _year_match(c.year, query.year)
        else:
            type_score = 0.0

        popularity = 0.7 * _log_norm(c.star_count, stats.max_stars) + 0.3 * _log_norm(c.view_count, stats.max_views)
        popularity = (1 - RECENCY_SHARE) * popularity + RECENCY_SHARE * _recency(c.created_at, now)

        rating = (bayesian_rating(c.average_rating, c.rating_count) - 1) / 4

        total = (
            weights.relevance * relevance
            + weights.subject_unit * subject_unit
            + weights.resource_type * type_score
            + weights.popularity * popularity
            + weights.rating * rating
        )
        out[c.id] = ScoreBreakdown(relevance, subject_unit, type_score, popularity, rating, total)
    return out
