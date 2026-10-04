"""Build GRIET's curriculum dataset from the official syllabus PDFs on griet.ac.in.

    python -m scripts.griet_scrape                 # download + parse → data/griet_curriculum.json
    python -m scripts.griet_scrape --pdf-dir DIR   # reuse already-downloaded PDFs

Source: https://www.griet.ac.in/syllabus.php (B.Tech, regulations GR22/GR24/GR25).
Each course page in those books looks like:

    GOKARAJU RANGARAJU INSTITUTE OF ENGINEERING AND TECHNOLOGY
    DATABASE MANAGEMENT SYSTEMS
    Course Code: GR22A2069   L/T/P/C: 3/0/0/3
    II Year I Semester
    Course Outcomes: 1. ... 2. ...
    UNIT I  <title>: <topics>
    ...
    Text/Reference Books: 1. ...
"""

import argparse
import json
import re
import subprocess
import urllib.parse
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from pypdf import PdfReader

SOURCE_PAGE = "https://www.griet.ac.in/syllabus.php"
BASE = "http://www.griet.ac.in/"
OUT = Path(__file__).resolve().parent.parent / "data" / "griet_curriculum.json"

BRANCHES = {
    "CSE": "Computer Science and Engineering",
    "CSM": "Computer Science and Engineering (AI & ML)",
    "CSD": "Computer Science and Engineering (Data Science)",
    "CSAI": "Computer Science and Engineering (Artificial Intelligence)",
    "CSBS": "Computer Science and Business System",
    "CSIT": "Computer Science and Information Technology",
    "IT": "Information Technology",
    "ECE": "Electronics and Communication Engineering",
    "EEE": "Electrical and Electronics Engineering",
    "ME": "Mechanical Engineering",
    "CE": "Civil Engineering",
}

# Links as published on the syllabus page. Some labels on the site point at the wrong
# book (e.g. GR24 "CSIT" → the Civil book); those entries are left out.
SYLLABUS_BOOKS: dict[str, list[tuple[str, str]]] = {
    "GR25": [("CE", "2026/GR25/GR25 CE 2803.pdf"), ("CSD", "2026/GR25/GR25 DS 2803.pdf"), ("CSBS", "2026/GR25/GR25 CSBS 2803.pdf"), ("CSM", "2026/GR25/GR25 AIML 2803.pdf"), ("CSE", "2026/GR25/GR25 CSE 2803.pdf"), ("EEE", "2026/GR25/GR25 EEE 2803.pdf"), ("ECE", "2026/GR25/GR25 ECE 2803.pdf"), ("ME", "2026/GR25/GR25 ME 2803.pdf")],
    "GR24": [("CE", "2026/GR24/B.Tech CE GR24 syllabus.pdf"), ("CSD", "2026/GR24/GR24 CSE(DS) Syllabus Book.pdf"), ("CSBS", "2026/GR24/B.Tech CSBS GR24 syllabus.pdf"), ("CSM", "2026/GR24/B.Tech CSE(AIML) GR24 syllabus.pdf"), ("CSE", "2026/GR24/B.Tech CSE GR24 syllabus.pdf"), ("EEE", "2026/GR24/B.Tech EEE GR24 Updated.pdf"), ("ECE", "2026/GR24/B.Tech ECE GR24 syllabus.pdf"), ("ME", "2026/GR24/B.Tech ME GR24 syllabus.pdf")],
    "GR22": [("CE", "2022/GR22/GR22 CE.pdf"), ("CSD", "2022/GR22/GR22 CSE(DS) updated 4may 2026.pdf"), ("CSBS", "2022/GR22/GR22 CSBS.pdf"), ("CSM", "2022/GR22/GR22 CSE(AIML).pdf"), ("CSE", "2022/GR22/GR22 CSE.pdf"), ("EEE", "2022/GR22/GR22 EEE.pdf"), ("ECE", "2022/GR22/GR22 ECE.pdf"), ("IT", "2022/GR22/GR22 IT.pdf"), ("ME", "2022/GR22/GR22 ME.pdf"), ("CSIT", "2022/GR22/GR22 CSIT.pdf"), ("CSAI", "2026/CSE(AI).pdf")],
}

ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6}
HEADER = "GOKARAJU RANGARAJU INSTITUTE OF ENGINEERING AND TECHNOLOGY"
CODE_RE = re.compile(
    r"Course\s*Code\s*:?\s*(GR\d{2}[A-Z]\d{4})\s*L\s*/\s*T\s*/\s*P\s*/\s*C\s*:?\s*([\d.]+)\s*/\s*([\d.]+)\s*/\s*([\d.]+)\s*/\s*([\d.]+)",
    re.I,
)
YEAR_RE = re.compile(r"\b(IV|III|II|I)\s*(?:B\.?\s*Tech\.?)?\s*Year\s*[-–,]?\s*(II|I)\s*Sem", re.I)
UNIT_RE = re.compile(r"(?:^|\n)[ \t]*UNIT[ \t]*[-–:.]?[ \t]*(VI|IV|V|III|II|I|[1-6])\b[ \t]*[-–:.]?", re.I)
BOOKS_RE = re.compile(r"(?:^|\n)[ \t]*(?:TEXT\s*/?\s*REFERENCE\s*BOOKS?|TEXT\s*BOOKS?|TEXTBOOKS?|REFERENCE\s*BOOKS?|REFERENCES?|SUGGESTED\s*READINGS?)\s*:?", re.I)
ELECTIVE_RE = re.compile(r"(PROFESSIONAL|OPEN)\s+ELECTIVE\s*[-–]?\s*([IVX]+|\d)?", re.I)
SMALL_WORDS = {"and", "of", "for", "in", "the", "to", "with", "on", "a", "an", "&", "by", "using", "via"}
KEEP_UPPER = {"AI", "ML", "IOT", "IoT", "SQL", "VLSI", "DBMS", "OS", "CAD", "CAM", "CNC", "PLC", "DSP", "R", "UML", "UI", "UX", "AR", "VR", "NLP", "GIS", "HVAC", "RF", "AC", "DC", "II", "III", "IV", "I", "C", "C++", "IC", "VHDL", "MATLAB", "API", "LLM", "LLMS", "GPU", "RCC", "MOOC", "IT"}


def download(pdf_dir: Path) -> None:
    pdf_dir.mkdir(parents=True, exist_ok=True)
    for reg, books in SYLLABUS_BOOKS.items():
        for branch, path in books:
            target = pdf_dir / f"{reg}_{branch}.pdf"
            if target.exists() and target.stat().st_size > 100_000:
                continue
            url = BASE + urllib.parse.quote(path)
            print("downloading", url)
            subprocess.run(["curl", "-sSL", "-m", "300", "-A", "Mozilla/5.0", "-o", str(target), url], check=True)


def pdf_pages(path: Path) -> list[str]:
    cache = path.with_suffix(".pages.json")
    if cache.exists() and cache.stat().st_mtime >= path.stat().st_mtime:
        return json.loads(cache.read_text())
    pages = [(p.extract_text() or "") for p in PdfReader(path).pages]
    cache.write_text(json.dumps(pages))
    return pages


def tidy(s: str) -> str:
    s = s.replace("\u00a0", " ").replace("\uf0b7", "•")
    lines = []
    for line in s.splitlines():
        line = line.strip()
        if not line or re.fullmatch(r"[ivxlcdm\d]{1,4}", line, re.I) or HEADER in line.upper():
            continue
        lines.append(line)
    return re.sub(r"[ \t]{2,}", " ", "\n".join(lines)).strip()


def nice_title(raw: str) -> str:
    raw = re.sub(r"gokaraju\s*rangaraju\s*institute\s*of\s*engineering\s*and\s*technology|\(\s*autonomous\s*\)", " ", raw, flags=re.I)
    raw = re.sub(r"\s+", " ", raw).strip(" -–:")
    if not raw.isupper():
        return raw
    words = []
    for i, w in enumerate(raw.split(" ")):
        core = w.strip("()&,-")
        if core.upper() in KEEP_UPPER or (len(core) <= 3 and core.isalpha() and core.upper() not in {"AND", "OF", "FOR", "THE", "TO", "IN", "ON", "WITH"} and not core.isalpha()):
            words.append(w)
        elif i > 0 and w.lower() in SMALL_WORDS:
            words.append(w.lower())
        else:
            words.append("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")))
    return " ".join(words)


def split_unit(body: str) -> tuple[str, str]:
    """First heading of a unit becomes its title, the rest its topics."""
    text = tidy(body)
    if not text:
        return "", ""
    first, _, rest = text.partition("\n")
    head, sep, tail = first.partition(":")
    if sep and len(head) <= 90:
        title, topics = head, (tail + "\n" + rest)
    elif len(first) <= 70 and rest:
        title, topics = first, rest
    else:
        m = re.match(r"(.{3,70}?)[,–;.-]\s", first)
        title, topics = (m.group(1) if m else first[:60]), text
    topics = re.sub(r"\s*\n\s*", " ", topics).strip(" :–-")
    return nice_title(title.strip(" -–:")), topics[:1500]


def parse_book(pages: list[str]) -> list[dict]:
    text = "\n".join(pages)
    offsets, pos = [], 0
    for p in pages:
        offsets.append(pos)
        pos += len(p) + 1

    def page_of(idx: int) -> int:
        lo, hi = 0, len(offsets) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if offsets[mid] <= idx:
                lo = mid
            else:
                hi = mid - 1
        return lo + 1

    def last_page(start: int, end: int) -> int:
        page = page_of(max(start, end - 1))
        # The next course usually begins a fresh page, just below its header.
        if page > page_of(start) and end - offsets[page - 1] < 250:
            page -= 1
        return page

    matches = list(CODE_RE.finditer(text))
    starts = []
    for m in matches:
        window = text[max(0, m.start() - 400) : m.start()]
        h = window.upper().rfind(HEADER)
        starts.append(m.start() - len(window) + h + len(HEADER) if h >= 0 else max(0, m.start() - 160))
    courses = []
    for i, m in enumerate(matches):
        title_raw = text[starts[i] : m.start()]
        title_lines = [l.strip() for l in title_raw.splitlines() if l.strip() and not re.fullmatch(r"\d+", l.strip())]
        title = nice_title(" ".join(title_lines[-3:]))
        end = starts[i + 1] if i + 1 < len(matches) else len(text)
        block = text[m.end() : end]
        year = YEAR_RE.search(block[:300])
        elective = ELECTIVE_RE.search(title_raw + block[:300])
        title = re.sub(r"\s*\(?(PROFESSIONAL|OPEN)\s+ELECTIVE.*$", "", title, flags=re.I).strip()
        if not title or len(title) > 120:
            continue

        units_found = list(UNIT_RE.finditer(block))
        books = BOOKS_RE.search(block, units_found[-1].end() if units_found else 0)
        outcomes_src = block[: units_found[0].start()] if units_found else block[:1500]
        oc = re.search(r"Course\s*Outcomes?\s*:?(.*)", outcomes_src, re.S | re.I)
        outcomes = [re.sub(r"\s+", " ", o).strip() for o in re.split(r"(?:^|\n)\s*\d+\s*[.)]\s*", oc.group(1) if oc else "") if len(o.strip()) > 8][:8]

        units = []
        for j, u in enumerate(units_found):
            n = ROMAN.get(u.group(1).upper()) or int(u.group(1))
            stop = units_found[j + 1].start() if j + 1 < len(units_found) else (books.start() if books else len(block))
            utitle, topics = split_unit(block[u.end() : stop])
            if n not in {x["number"] for x in units} and (utitle or topics):
                units.append({"number": n, "title": utitle or f"Unit {n}", "topics": topics})

        book_lines = []
        if books:
            for line in re.split(r"\n\s*(?=\d+\s*[.)])", tidy(block[books.end() :])):
                line = re.sub(r"\s+", " ", re.sub(r"^\d+\s*[.)]\s*", "", line)).strip()
                if 10 < len(line) < 300 and not line.startswith("/") and not line.endswith(":"):
                    book_lines.append(line)
        lab_tasks = ""
        L, T, P, C = (float(x) for x in m.groups()[1:])
        is_lab = "LAB" in title.upper() or "WORKSHOP" in title.upper() or (L == 0 and P > 0)
        if not units:
            start = re.search(r"\n\s*(?:TASK|WEEK|LIST\s+OF|EXPERIMENTS?|PROGRAMS?|EXERCISES?|LAB\s+PROGRAMS?)\b", block[:8000], re.I)
            lab_tasks = tidy(block[start.start() : start.start() + 4000])[:3000] if (is_lab and start) else ""
        courses.append(
            {
                "code": m.group(1).upper(),
                "title": title,
                "ltpc": [L, T, P, C],
                # Open-elective pages omit the year; GRIET codes encode it (GR22A3018 → III year).
                "year": ROMAN.get(year.group(1).upper()) if year else int(m.group(1)[5]) if m.group(1)[5] in "1234" else None,
                "semester": ROMAN.get(year.group(2).upper()) if year else None,
                "kind": "project" if re.search(r"PROJECT\s*WORK|MINI\s*PROJECT|INTERNSHIP|SEMINAR|FIELD.?BASED|SOCIETAL", title, re.I) else ("lab" if is_lab else "theory"),
                "elective": (f"{elective.group(1).title()} Elective {elective.group(2) or ''}".strip() if elective else None),
                "outcomes": outcomes,
                "units": sorted(units, key=lambda u: u["number"]),
                "books": book_lines[:10],
                "lab_tasks": lab_tasks,
                # 1-based page range of this course inside its syllabus book.
                "pages": [page_of(starts[i]), last_page(starts[i], end)],
            }
        )
    return courses


def _parse_one(args: tuple[str, str, str]) -> tuple[str, str, list[dict]]:
    reg, branch, path = args
    return reg, branch, parse_book(pdf_pages(Path(path)))


def build(pdf_dir: Path) -> dict:
    jobs = [(reg, br, str(pdf_dir / f"{reg}_{br}.pdf")) for reg, books in SYLLABUS_BOOKS.items() for br, _ in books]
    with ProcessPoolExecutor() as ex:
        parsed = list(ex.map(_parse_one, jobs))

    courses: dict[str, dict] = {}
    for reg, branch, items in parsed:
        url = BASE + urllib.parse.quote(dict(SYLLABUS_BOOKS[reg])[branch])
        for c in items:
            offering = {"branch": branch, "year": c["year"], "semester": c["semester"], "elective": c["elective"]}
            copy = {**{k: v for k, v in c.items() if k != "elective"}, "book": f"{reg}_{branch}", "source_url": url}
            existing = courses.get(c["code"])
            if existing is None:
                courses[c["code"]] = {**copy, "regulation": reg, "offerings": [offering]}
                continue
            if offering not in existing["offerings"]:
                existing["offerings"].append(offering)
            # Same course printed in several books: keep the most complete copy.
            if len(c["units"]) > len(existing["units"]) or (len(c["units"]) == len(existing["units"]) and len(json.dumps(c)) > len(json.dumps(existing)) * 1.2):
                existing.update({k: v for k, v in copy.items() if k != "code"})
    return {
        "source": SOURCE_PAGE,
        "regulations": {reg: {"books": {br: BASE + urllib.parse.quote(p) for br, p in books}} for reg, books in SYLLABUS_BOOKS.items()},
        "branches": BRANCHES,
        "courses": sorted(courses.values(), key=lambda c: c["code"]),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-dir", type=Path, default=Path("/tmp/griet-syllabus"))
    args = ap.parse_args()
    download(args.pdf_dir)
    data = build(args.pdf_dir)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False))
    cs = data["courses"]
    print(f"{len(cs)} courses → {OUT}")
    print(f"  with 5 units: {sum(len(c['units']) >= 5 for c in cs)} · labs: {sum(c['kind'] == 'lab' for c in cs)} · no year: {sum(c['year'] is None for c in cs)}")


if __name__ == "__main__":
    main()
