"""Turns free-text queries like "dbms unit 3 pyq 2024" into structured intent.

Recognised facets are removed from the keyword list so full-text search only sees
the topical words ("normalization", "deadlock", ...).
"""

import re
from dataclasses import dataclass, field

ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6}
WORD_NUMBERS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}

# Longest phrases first so "previous year paper" wins over "paper".
TYPE_PHRASES: list[tuple[str, str]] = sorted(
    [
        ("previous year papers", "pyq"),
        ("previous year paper", "pyq"),
        ("previous year questions", "pyq"),
        ("previous years", "pyq"),
        ("previous year", "pyq"),
        ("past papers", "pyq"),
        ("past paper", "pyq"),
        ("old papers", "pyq"),
        ("pyqs", "pyq"),
        ("pyq", "pyq"),
        ("mid exam papers", "mid"),
        ("mid exam paper", "mid"),
        ("mid exam", "mid"),
        ("mid sem", "mid"),
        ("midsem", "mid"),
        ("mid term", "mid"),
        ("midterm", "mid"),
        ("mids", "mid"),
        ("mid", "mid"),
        ("semester papers", "semester"),
        ("semester paper", "semester"),
        ("semester exam", "semester"),
        ("sem papers", "semester"),
        ("sem paper", "semester"),
        ("end semester", "semester"),
        ("end sem", "semester"),
        ("endsem", "semester"),
        ("semester", "semester"),
        ("question banks", "question_bank"),
        ("question bank", "question_bank"),
        ("important questions", "question_bank"),
        ("qb", "question_bank"),
        ("assignments", "assignment"),
        ("assignment", "assignment"),
        ("lecture notes", "notes"),
        ("handwritten notes", "notes"),
        ("short notes", "notes"),
        ("notes", "notes"),
        ("note", "notes"),
        ("reference material", "reference"),
        ("reference", "reference"),
        ("textbook", "reference"),
        ("book", "reference"),
    ],
    key=lambda p: -len(p[0]),
)

EXAM_PATTERNS: list[tuple[re.Pattern[str], str, str | None]] = [
    (re.compile(r"\bmid[\s-]*(?:1|i|one)\b"), "mid1", "mid"),
    (re.compile(r"\bmid[\s-]*(?:2|ii|two)\b"), "mid2", "mid"),
    (re.compile(r"\b(?:supplementary|supply|supple)\b"), "supplementary", None),
    (re.compile(r"\binternals?\b"), "internal", None),
]

UNIT_RE = re.compile(r"\b(?:unit|module|chapter|u)[\s-]*(\d{1,2}|one|two|three|four|five|six|vi|iv|v|i{1,3})\b")
YEAR_RE = re.compile(r"\b(199\d|20\d{2})\b")

# Words that carry no topical meaning once facets are extracted.
STOPWORDS = {
    "a", "an", "the", "of", "for", "in", "on", "and", "or", "to", "with", "about",
    "paper", "papers", "exam", "exams", "question", "questions", "pdf", "pdfs",
    "material", "materials", "unit", "units", "year", "sem", "best", "important", "all",
}


@dataclass
class SubjectRef:
    id: int
    slug: str
    code: str
    name: str
    aliases: list[str]


@dataclass
class ParsedQuery:
    raw: str
    keywords: list[str] = field(default_factory=list)
    subject: SubjectRef | None = None
    unit_number: int | None = None
    resource_type: str | None = None
    year: int | None = None
    exam_type: str | None = None

    @property
    def facet_count(self) -> int:
        return sum(
            x is not None for x in (self.subject, self.unit_number, self.resource_type, self.year, self.exam_type)
        )

    def to_dict(self) -> dict:
        return {
            "raw": self.raw,
            "keywords": self.keywords,
            "subject": {"id": self.subject.id, "slug": self.subject.slug, "code": self.subject.code, "name": self.subject.name}
            if self.subject
            else None,
            "unit_number": self.unit_number,
            "resource_type": self.resource_type,
            "year": self.year,
            "exam_type": self.exam_type,
        }


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text.lower())).strip()


def _cut(text: str, start: int, end: int) -> str:
    return f"{text[:start]} {text[end:]}"


def _subject_phrases(subjects: list[SubjectRef]) -> list[tuple[str, SubjectRef]]:
    phrases: list[tuple[str, SubjectRef]] = []
    for s in subjects:
        for p in {s.slug.replace("-", " "), s.code, s.name, *s.aliases}:
            p = normalize(p)
            if p:
                phrases.append((p, s))
    return sorted(phrases, key=lambda p: -len(p[0]))


def parse_query(raw: str, subjects: list[SubjectRef]) -> ParsedQuery:
    parsed = ParsedQuery(raw=raw)
    text = f" {normalize(raw)} "

    for phrase, subject in _subject_phrases(subjects):
        m = re.search(rf"\b{re.escape(phrase)}\b", text)
        if m:
            parsed.subject = subject
            text = _cut(text, m.start(), m.end())
            break

    for pattern, exam, rtype in EXAM_PATTERNS:
        m = pattern.search(text)
        if m:
            parsed.exam_type = exam
            parsed.resource_type = parsed.resource_type or rtype
            text = _cut(text, m.start(), m.end())
            break

    m = UNIT_RE.search(text)
    if m:
        token = m.group(1)
        number = int(token) if token.isdigit() else WORD_NUMBERS.get(token) or ROMAN.get(token)
        if number and 1 <= number <= 12:
            parsed.unit_number = number
            text = _cut(text, m.start(), m.end())

    m = YEAR_RE.search(text)
    if m:
        parsed.year = int(m.group(1))
        text = _cut(text, m.start(), m.end())

    if parsed.resource_type is None:
        for phrase, rtype in TYPE_PHRASES:
            m = re.search(rf"\b{re.escape(phrase)}\b", text)
            if m:
                parsed.resource_type = rtype
                text = _cut(text, m.start(), m.end())
                break

    parsed.keywords = [w for w in text.split() if w not in STOPWORDS and len(w) > 1]
    return parsed
