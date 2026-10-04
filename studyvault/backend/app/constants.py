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
    "GR25": "GR25 · admitted 2025 onwards",
    "GR24": "GR24 · admitted 2024",
    "GR22": "GR22 · admitted 2022–2023",
}
