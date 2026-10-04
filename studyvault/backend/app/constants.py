RESOURCE_TYPES: dict[str, str] = {
    "notes": "Notes",
    "pyq": "Previous Year Papers",
    "mid": "Mid Exam Papers",
    "semester": "Semester Papers",
    "question_bank": "Question Banks",
    "assignment": "Assignments",
    "reference": "Reference Material",
}

EXAM_TYPES: dict[str, str] = {
    "mid1": "Mid 1",
    "mid2": "Mid 2",
    "semester": "Semester",
    "supplementary": "Supplementary",
    "internal": "Internal Assessment",
}

# Resource types whose metadata should carry an exam type.
EXAM_RESOURCE_TYPES = {"pyq", "mid", "semester"}

REPORT_REASONS: dict[str, str] = {
    "spam": "Spam or advertising",
    "wrong_subject": "Wrong subject / unit",
    "low_quality": "Unreadable or low quality",
    "copyright": "Copyright violation",
    "inappropriate": "Inappropriate content",
    "other": "Other",
}

# GRIET B.Tech regulations currently in force (syllabus books on griet.ac.in/syllabus.php).
REGULATIONS: dict[str, str] = {
    "GR25": "GR25 · I & II year (admitted 2025 onwards)",
    "GR24": "GR24 · III year (admitted 2024)",
    "GR22": "GR22 · IV year (admitted 2023)",
}

# The one syllabus each year of study follows right now (2026–27): I and II year are the
# GR25 batches, III year is GR24, IV year is GR22. Students pick a year; the regulation follows.
CURRENT_REGULATION_BY_YEAR: dict[int, str] = {1: "GR25", 2: "GR25", 3: "GR24", 4: "GR22"}


def regulation_for_year(year: int | None) -> str | None:
    return CURRENT_REGULATION_BY_YEAR.get(year) if year else None
