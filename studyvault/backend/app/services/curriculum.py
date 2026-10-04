"""Load GRIET's curriculum (data/griet_curriculum.json) into branches/subjects/units.

Idempotent: subjects are matched by course code, so re-running after a new scrape
updates titles, units and offerings without touching uploaded resources.
"""

import json
import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Branch, Resource, Subject, SubjectOffering, Unit

DATA_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "griet_curriculum.json"

# Abbreviations students actually type, keyed by normalised course title.
KNOWN_ABBREVIATIONS: dict[str, tuple[str, list[str]]] = {
    "database management systems": ("DBMS", ["dbms", "database"]),
    "operating systems": ("OS", ["os", "operating system"]),
    "computer networks": ("CN", ["cn", "networks", "computer network"]),
    "data communications and computer networks": ("DCCN", ["dccn", "cn"]),
    "data structures": ("DS", ["ds", "dsa"]),
    "advanced data structures": ("ADS", ["ads"]),
    "design and analysis of algorithms": ("DAA", ["daa", "algorithms"]),
    "software engineering": ("SE", ["se"]),
    "computer organization and architecture": ("COA", ["coa"]),
    "computer organization": ("CO", ["co"]),
    "formal languages and automata theory": ("FLAT", ["flat", "toc", "automata"]),
    "automata and compiler design": ("ACD", ["acd"]),
    "compiler design": ("CD", ["cd", "compiler"]),
    "machine learning": ("ML", ["ml"]),
    "deep learning": ("DL", ["dl"]),
    "artificial intelligence": ("AI", ["ai"]),
    "programming for problem solving": ("PPS", ["pps", "c programming"]),
    "web technologies": ("WT", ["wt", "web tech"]),
    "cloud computing": ("CC", ["cc"]),
    "internet of things": ("IoT", ["iot"]),
    "object oriented programming": ("OOP", ["oop", "oops"]),
    "object oriented programming using java": ("OOPJ", ["oop", "oops", "java"]),
    "java programming": ("JAVA", ["java"]),
    "python programming": ("PY", ["python"]),
    "discrete mathematics": ("DM", ["dm", "discrete maths"]),
    "discrete mathematics for computer science": ("DMCS", ["dm", "discrete maths"]),
    "digital logic design": ("DLD", ["dld"]),
    "digital electronics": ("DE", ["de"]),
    "computer graphics": ("CG", ["cg"]),
    "cryptography and network security": ("CNS", ["cns", "cryptography"]),
    "information security": ("IS", ["infosec"]),
    "big data analytics": ("BDA", ["bda", "big data"]),
    "data mining": ("DM", ["data mining"]),
    "natural language processing": ("NLP", ["nlp"]),
    "linear algebra and function approximation": ("LAFA", ["m1", "maths 1", "linear algebra"]),
    "differential equations and vector calculus": ("DEVC", ["m2", "maths 2"]),
    "probability and statistics": ("P&S", ["ps", "probability"]),
    "engineering chemistry": ("CHEM", ["chemistry"]),
    "applied physics": ("PHY", ["physics"]),
    "engineering physics": ("PHY", ["physics"]),
    "english": ("ENG", ["english"]),
    "signals and systems": ("SS", ["signals"]),
    "digital signal processing": ("DSP", ["dsp"]),
    "electromagnetic fields": ("EMF", ["emf"]),
    "control systems": ("CS", ["control systems"]),
    "power systems i": ("PS-I", ["power systems"]),
    "thermodynamics": ("TD", ["thermo"]),
    "fluid mechanics": ("FM", ["fluid mechanics"]),
    "strength of materials": ("SOM", ["som"]),
    "engineering mechanics": ("EM", ["mechanics"]),
    "graphics for engineers": ("GFE", ["graphics", "eg"]),
}
SMALL = {"and", "of", "for", "in", "the", "to", "with", "on", "a", "an", "using", "lab", "laboratory", "&", "-", "–"}
ROMAN = ["", "I", "II", "III", "IV"]


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9& ]+", " ", s.lower())).strip()


def short_code(title: str, kind: str) -> tuple[str, list[str]]:
    base = norm(re.sub(r"\b(lab(oratory)?|workshop)\b", "", title, flags=re.I))
    if base in KNOWN_ABBREVIATIONS:
        code, aliases = KNOWN_ABBREVIATIONS[base]
    else:
        words = [w for w in base.split() if w not in SMALL and not re.fullmatch(r"[ivx]+", w)]
        code = (words[0][:4] if len(words) == 1 else "".join(w[0] for w in words)[:6]).upper() if words else title[:4].upper()
        roman = re.search(r"\b(i{1,3}|iv)\s*$", base)
        if roman:
            code = f"{code}-{roman.group(1).upper()}"
        aliases = []
    if kind == "lab":
        return f"{code} LAB"[:16], []
    return code[:16], aliases


def semester_label(year: int | None, semester: int | None) -> str:
    if not year:
        return ""
    return f"{ROMAN[year]} Year" + (f" {ROMAN[semester]} Semester" if semester else "")


def load_curriculum(db: Session, data_file: Path = DATA_FILE) -> dict[str, int]:
    data = json.loads(data_file.read_text())
    branches = {b.code: b for b in db.scalars(select(Branch))}
    for code, name in data["branches"].items():
        if code in branches:
            branches[code].name = name
        else:
            branches[code] = Branch(code=code, name=name)
            db.add(branches[code])
    db.flush()

    existing = {
        s.course_code: s
        for s in db.scalars(select(Subject).options(selectinload(Subject.units), selectinload(Subject.offerings)).where(Subject.course_code.is_not(None)))
    }
    used_units = set(db.scalars(select(Resource.unit_id).distinct()))
    created = updated = 0
    for c in data["courses"]:
        code, aliases = short_code(c["title"], c["kind"])
        L, T, P, C = c["ltpc"]
        units = c["units"] or [
            {
                "number": 1,
                "title": {"lab": "Lab experiments", "project": "Project work"}.get(c["kind"], "Syllabus"),
                "topics": (c["lab_tasks"] or "").replace("\n", " · ")[:1500],
            }
        ]
        fields = dict(
            code=code,
            slug=c["code"].lower(),
            name=c["title"][:160],
            description="Covers " + "; ".join(u["title"] for u in units[:5]) if c["units"] else f"{c['kind'].title()} course · {semester_label(c['year'], c['semester'])}",
            aliases=",".join(dict.fromkeys([*aliases, c["code"].lower()])),
            regulation=c["regulation"],
            year=c["year"],
            semester=c["semester"],
            ltpc=f"{L:g}/{T:g}/{P:g}/{C:g}",
            credits=C,
            kind=c["kind"],
            outcomes="\n".join(c["outcomes"]),
            books="\n".join(c["books"]),
            lab_tasks=c["lab_tasks"],
            source_url=c["source_url"],
        )
        subject = existing.get(c["code"])
        if subject is None:
            subject = Subject(course_code=c["code"], **fields)
            db.add(subject)
            created += 1
        else:
            for k, v in fields.items():
                setattr(subject, k, v)
            updated += 1

        by_number = {u.number: u for u in subject.units}
        for u in units:
            title, topics = u["title"][:200], u["topics"]
            if u["number"] in by_number:
                by_number[u["number"]].title, by_number[u["number"]].topics = title, topics
            else:
                subject.units.append(Unit(number=u["number"], title=title, topics=topics))
        wanted = {u["number"] for u in units}
        for n, unit in by_number.items():
            if n not in wanted and unit.id not in used_units:
                subject.units.remove(unit)

        subject.offerings.clear()
        db.flush()
        seen_branches = set()
        for o in c["offerings"]:
            if o["branch"] in seen_branches:
                continue
            seen_branches.add(o["branch"])
            subject.offerings.append(
                SubjectOffering(branch_id=branches[o["branch"]].id, year=o["year"], semester=o["semester"], elective=o["elective"])
            )
    db.commit()
    return {"created": created, "updated": updated, "branches": len(branches)}
