"""Seed StudyVault with subjects, users and real generated PDFs.

Usage:  python -m scripts.seed [--reset]
"""

import argparse
import io
import random
import shutil
import sys
from datetime import UTC, datetime, timedelta

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, ListFlowable, ListItem, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func, insert, select, text

from app.config import get_settings
from app.database import SessionLocal
from app.models import Bookmark, Report, Resource, ResourceRating, ResourceStar, ResourceText, ResourceView, Subject, Unit, User
from app.services.pdf_text import extract_pdf
from app.services.resources import set_tags
from app.services.security import hash_password
from app.services.storage import get_storage
from scripts.seed_data import FIRST_NAMES, NAMED_USERS, SUBJECTS

rng = random.Random(20261004)
NOW = datetime.now(UTC)
ACCENT = colors.HexColor("#4F46E5")

styles = getSampleStyleSheet()
H_TITLE = ParagraphStyle("t", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=20, leading=24, alignment=TA_LEFT, spaceAfter=4)
H_META = ParagraphStyle("m", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#6B7280"), spaceAfter=10)
H2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, textColor=ACCENT, spaceBefore=10, spaceAfter=4)
BODY = ParagraphStyle("b", parent=styles["BodyText"], fontSize=10.5, leading=15)
SMALL = ParagraphStyle("s", parent=BODY, fontSize=9, textColor=colors.HexColor("#4B5563"))

QUESTION_TEMPLATES = [
    "Explain {c} with a neat diagram and a suitable example.",
    "What is meant by {c}? Discuss its advantages and limitations.",
    "Write short notes on {c}.",
    "Illustrate {c} with a worked example.",
    "Compare {c} with {d}. When would you prefer one over the other?",
    "Discuss the role of {c} in {u}.",
    "Define {c}. Derive or justify the key properties involved.",
]


def _header_footer(subject_code: str, label: str):
    def draw(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(ACCENT)
        canvas.rect(0, A4[1] - 6, A4[0], 6, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(colors.HexColor("#111827"))
        canvas.drawString(18 * mm, A4[1] - 14 * mm, f"StudyVault  ·  {subject_code}")
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#6B7280"))
        canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 14 * mm, label)
        canvas.drawCentredString(A4[0] / 2, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    return draw


def _questions(concepts, unit_title, n, rnd):
    qs = []
    names = [c[0] for c in concepts]
    for i in range(n):
        c = names[i % len(names)]
        d = rnd.choice([x for x in names if x != c])
        qs.append(rnd.choice(QUESTION_TEMPLATES).format(c=c, d=d, u=unit_title))
    return qs


def build_pdf(kind: str, subject: dict, unit_no: int, units: list, title: str, year: int, exam_label: str | None) -> bytes:
    rnd = random.Random(title)
    unit_title, concepts = units[unit_no - 1]
    buf = io.BytesIO()
    label = f"Unit {unit_no} · {unit_title}" if kind not in {"semester", "mid"} else (exam_label or "Examination")
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=22 * mm, bottomMargin=18 * mm, title=title, author="StudyVault seed")
    story = [Paragraph(title, H_TITLE), Paragraph(f"{subject['name']} ({subject['code']}) &nbsp;·&nbsp; {label} &nbsp;·&nbsp; {year}", H_META), HRFlowable(width="100%", color=colors.HexColor("#E5E7EB"), spaceAfter=8)]

    if kind in {"notes", "reference"}:
        scope = concepts if kind == "notes" else [c for _, cs in units for c in cs[:3]]
        story.append(Paragraph("Overview", H2))
        story.append(Paragraph(f"These notes cover <b>{unit_title if kind == 'notes' else subject['name']}</b>. {subject['description']} Each section states the core idea, a worked intuition and the points examiners look for.", BODY))
        for i, (name, expl) in enumerate(scope, 1):
            story.append(Paragraph(f"{i}. {name}", H2))
            story.append(Paragraph(expl, BODY))
            story.append(Spacer(1, 4))
            story.append(Paragraph(f"<b>Why it matters:</b> {name} appears regularly in mid and semester examinations. Be ready to define it precisely, draw a diagram where relevant, and give one realistic example.", BODY))
            story.append(ListFlowable([ListItem(Paragraph(t, BODY)) for t in [
                f"Key definition of {name.lower()} in one line.",
                f"A small example showing {name.lower()} in practice.",
                "Common mistakes students make and how to avoid them.",
            ]], bulletType="bullet", start="•", leftIndent=12))
            if i % 3 == 0:
                story.append(PageBreak())
        story.append(Paragraph("Quick revision", H2))
        story.append(Paragraph(" · ".join(n for n, _ in scope), SMALL))
    elif kind in {"question_bank", "pyq", "assignment"}:
        n = {"question_bank": 18, "pyq": 14, "assignment": 6}[kind]
        intro = {
            "question_bank": "Important and frequently asked questions, grouped by marks.",
            "pyq": f"Questions collected from previous year university examinations ({year - 4}–{year}).",
            "assignment": "Answer all questions. Show working and cite references where used.",
        }[kind]
        story.append(Paragraph(intro, BODY))
        qs = _questions(concepts, unit_title, n, rnd)
        groups = [("Part A — Short answer (2 marks)", qs[: n // 3]), ("Part B — Long answer (10 marks)", qs[n // 3 :])] if kind != "assignment" else [("Questions", qs)]
        for heading, items in groups:
            story.append(Paragraph(heading, H2))
            for j, q in enumerate(items, 1):
                tag = f" <font color='#6B7280'>[{rnd.choice(range(year - 4, year + 1))}]</font>" if kind == "pyq" else ""
                story.append(Paragraph(f"{j}. {q}{tag}", BODY))
                story.append(Spacer(1, 3))
    else:  # semester / mid papers
        scope_units = range(1, 6) if kind == "semester" else (range(1, 4) if "1" in (exam_label or "") else range(3, 6))
        rows = [["Max. Marks", "75" if kind == "semester" else "30", "Time", "3 hours" if kind == "semester" else "90 minutes"]]
        t = Table(rows, colWidths=[30 * mm, 30 * mm, 30 * mm, 40 * mm])
        t.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Helvetica", 9), ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB"))]))
        story += [t, Spacer(1, 8), Paragraph("Answer ALL questions from Part A and any FIVE from Part B." if kind == "semester" else "Answer any THREE questions.", BODY)]
        if kind == "semester":
            story.append(Paragraph("Part A (25 marks)", H2))
            for i, u in enumerate(scope_units, 1):
                story.append(Paragraph(f"{i}. {_questions(units[u - 1][1], units[u - 1][0], 1, rnd)[0]} (5 marks)", BODY))
        story.append(Paragraph("Part B" if kind == "semester" else "Questions", H2))
        q = 1
        for u in scope_units:
            u_title, u_concepts = units[u - 1]
            for qq in _questions(u_concepts, u_title, 2, rnd):
                story.append(Paragraph(f"{q}. {qq} <font color='#6B7280'>(Unit {u})</font>", BODY))
                story.append(Spacer(1, 3))
                q += 1
    doc.build(story, onFirstPage=_header_footer(subject["code"], label), onLaterPages=_header_footer(subject["code"], label))
    return buf.getvalue()


def plan_resources(subject: dict) -> list[dict]:
    code = subject["code"]
    units = subject["units"]
    plan: list[dict] = []
    for n, (utitle, concepts) in enumerate(units, 1):
        plan.append(dict(kind="notes", unit=n, year=rng.choice([2024, 2025]), title=f"{code} Unit {n} — {utitle} Complete Notes",
                         desc=f"Well-structured notes for Unit {n} covering {', '.join(c[0] for c in concepts[:4])} and more. Includes examples and exam tips.",
                         tags=[code.lower(), f"unit {n}", *[c[0].lower() for c in concepts[:3]]]))
        plan.append(dict(kind="question_bank", unit=n, year=2025, title=f"{code} Unit {n} Question Bank — {utitle}",
                         desc=f"Important 2-mark and 10-mark questions for {utitle}, compiled from recent exams.",
                         tags=[code.lower(), "important questions", f"unit {n}", concepts[0][0].lower()]))
        plan.append(dict(kind="pyq", unit=n, year=rng.choice([2023, 2024, 2025]), title=f"{code} Unit {n} Previous Year Questions",
                         desc=f"Unit-wise previous year questions on {utitle}, tagged by exam year.",
                         tags=[code.lower(), "pyq", f"unit {n}", concepts[1][0].lower()]))
    for n in rng.sample(range(1, 6), 2):
        utitle, concepts = units[n - 1]
        plan.append(dict(kind="notes", unit=n, year=2025, title=f"{utitle} — Short Revision Notes ({code})",
                         desc=f"One-night-before-exam revision notes for {utitle}.", tags=[code.lower(), "revision", "short notes", concepts[2][0].lower()]))
    for n in (1, 3):
        utitle, concepts = units[n - 1]
        plan.append(dict(kind="assignment", unit=n, year=2025, title=f"{code} Assignment {1 if n == 1 else 2} — {utitle}",
                         desc=f"Assignment problems on {utitle}.", tags=[code.lower(), "assignment", concepts[0][0].lower()]))
    for i, year in enumerate([2025, 2024, 2023]):
        plan.append(dict(kind="semester", unit=[5, 3, 2][i], year=year, exam="semester", title=f"{code} Semester Examination {year}",
                         desc=f"End-semester question paper, {year} regular examination.", tags=[code.lower(), "semester paper", str(year)]))
    for exam, year, unit in [("mid1", 2025, 1), ("mid2", 2025, 4), ("mid1", 2024, 2)]:
        label = "Mid 1" if exam == "mid1" else "Mid 2"
        plan.append(dict(kind="mid", unit=unit, year=year, exam=exam, title=f"{code} {label} Exam Paper {year}",
                         desc=f"{label} internal examination paper, {year}.", tags=[code.lower(), "mid exam", label.lower(), str(year)]))
    plan.append(dict(kind="reference", unit=1, year=2024, title=f"{subject['name']} — Reference Handbook",
                     desc=f"A compact reference covering every unit of {subject['name']}.", tags=[code.lower(), "reference", "handbook"]))
    return plan


def reset(db) -> None:
    db.execute(text("TRUNCATE users, subjects, units, resources, resource_texts, tags, resource_tags, resource_stars, resource_ratings, bookmarks, resource_views, reports RESTART IDENTITY CASCADE"))
    db.commit()
    storage_dir = get_settings().storage_dir
    if storage_dir.exists():
        shutil.rmtree(storage_dir)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="wipe existing data first")
    args = parser.parse_args()

    db = SessionLocal()
    if args.reset:
        reset(db)
    elif db.scalar(select(func.count(User.id))):
        print("Database already seeded (use --reset to reseed).")
        return
    storage = get_storage()

    print("· users")
    shared_hash = hash_password("password123")
    admin = User(username="admin", email="admin@studyvault.dev", full_name="StudyVault Admin", password_hash=hash_password("admin12345"), is_admin=True)
    named = [User(username=u, email=f"{u}@studyvault.dev", full_name=n, college=c, password_hash=hash_password(f"{u}12345") if u == "sanjith" else shared_hash) for u, n, c in NAMED_USERS]
    spammer = User(username="freenotes_hub", email="spam@example.com", full_name="Free Notes Hub", password_hash=shared_hash)
    crowd = [
        User(username=f"{FIRST_NAMES[i % len(FIRST_NAMES)]}{i:02d}", email=f"student{i:02d}@studyvault.dev",
             full_name=f"{FIRST_NAMES[i % len(FIRST_NAMES)].title()} {chr(65 + i % 26)}.", password_hash=shared_hash)
        for i in range(70)
    ]
    db.add_all([admin, *named, spammer, *crowd])
    db.commit()
    sanjith = named[0]
    uploaders = named[1:] + [sanjith]
    raters = named + crowd

    print("· subjects & units")
    subject_rows = {}
    for s in SUBJECTS:
        subj = Subject(code=s["code"], slug=s["slug"], name=s["name"], description=s["description"], aliases=s["aliases"])
        subj.units = [Unit(number=i, title=t, topics=", ".join(c[0] for c in cs)) for i, (t, cs) in enumerate(s["units"], 1)]
        db.add(subj)
        subject_rows[s["code"]] = subj
    db.commit()

    print("· resources (generating PDFs)")
    resources: list[tuple[Resource, float]] = []
    for s in SUBJECTS:
        subj = subject_rows[s["code"]]
        for item in plan_resources(s):
            unit = subj.units[item["unit"] - 1]
            exam_label = {"mid1": "Mid 1 Examination", "mid2": "Mid 2 Examination", "semester": "Semester Examination"}.get(item.get("exam"))
            pdf = build_pdf(item["kind"], s, item["unit"], s["units"], item["title"], item["year"], exam_label)
            info = extract_pdf(io.BytesIO(pdf))
            key = storage.save(io.BytesIO(pdf), f"{item['title']}.pdf")
            r = Resource(
                title=item["title"], description=item["desc"], file_key=key,
                file_name=item["title"].replace("/", "-").replace(" — ", " - ") + ".pdf", file_size=len(pdf), page_count=info.page_count,
                subject_id=subj.id, unit_id=unit.id, resource_type=item["kind"], year=item["year"], exam_type=item.get("exam"),
                uploaded_by=rng.choice(uploaders).id,
                created_at=NOW - timedelta(days=rng.randint(4, 420), hours=rng.randint(0, 23)),
            )
            set_tags(db, r, item["tags"])
            r.text = ResourceText(content=info.text)
            db.add(r)
            # Latent quality drives stars/ratings/views so the ranking has something to work with.
            quality = rng.betavariate(2, 2.6)
            if item["kind"] in {"notes", "pyq"} and item["unit"] == 3:
                quality = min(1, quality + 0.3)
            resources.append((r, quality))
    db.commit()

    # Spam upload for the moderation queue.
    dbms = SUBJECTS[0]
    spam_pdf = build_pdf("notes", dbms, 1, dbms["units"], "FREE DOWNLOAD ALL NOTES CLICK HERE", 2025, None)
    info = extract_pdf(io.BytesIO(spam_pdf))
    spam = Resource(title="FREE DOWNLOAD ALL NOTES CLICK HERE!!!", description="visit my channel for all notes free free free", file_key=storage.save(io.BytesIO(spam_pdf), "spam.pdf"),
                    file_name="free-notes.pdf", file_size=len(spam_pdf), page_count=info.page_count, subject_id=subject_rows["DBMS"].id, unit_id=subject_rows["DBMS"].units[0].id,
                    resource_type="notes", year=2025, uploaded_by=spammer.id, created_at=NOW - timedelta(days=1))
    set_tags(db, spam, ["free", "download"])
    spam.text = ResourceText(content=info.text)
    db.add(spam)
    db.commit()

    print("· stars, ratings, bookmarks, views")
    star_rows, rating_rows, bookmark_rows = [], [], []
    for r, q in resources:
        n_stars = int(round(q ** 1.6 * 58 + rng.random() * 3))
        n_ratings = max(0, int(round(q * 26 + rng.gauss(0, 3))))
        mean = 2.4 + q * 2.6
        for u in rng.sample(raters, min(n_stars, len(raters))):
            star_rows.append({"user_id": u.id, "resource_id": r.id, "created_at": r.created_at + timedelta(days=rng.randint(0, 3))})
        for u in rng.sample(raters, min(n_ratings, len(raters))):
            rating_rows.append({"user_id": u.id, "resource_id": r.id, "rating": max(1, min(5, round(rng.gauss(mean, 0.7))))})
        for u in rng.sample(raters, min(int(n_stars * 0.4), len(raters))):
            bookmark_rows.append({"user_id": u.id, "resource_id": r.id})
        r.view_count = int(n_stars * rng.uniform(9, 22) + rng.randint(15, 160))
    db.execute(insert(ResourceStar), star_rows)
    db.execute(insert(ResourceRating), rating_rows)
    db.execute(insert(Bookmark), [b for b in bookmark_rows if b["user_id"] != sanjith.id])

    # Sanjith's personal history powers the dashboard demo.
    picks = [r for r, _ in resources if r.subject_id == subject_rows["DBMS"].id and r.resource_type in {"notes", "pyq"}][:3]
    picks += [r for r, _ in resources if r.subject_id == subject_rows["OS"].id and r.unit_id == subject_rows["OS"].units[2].id][:1]
    for r, ago, page in zip(picks, [timedelta(minutes=12), timedelta(hours=3), timedelta(days=1, hours=2), timedelta(days=3)], [4, 2, 1, 3]):
        db.add(ResourceView(user_id=sanjith.id, resource_id=r.id, viewed_at=NOW - ago, last_page=min(page, r.page_count)))
    for r in [r for r, _ in resources if r.subject_id in {subject_rows["DBMS"].id, subject_rows["OS"].id} and r.resource_type in {"question_bank", "semester"}][:5]:
        db.add(Bookmark(user_id=sanjith.id, resource_id=r.id))

    print("· reports")
    low = sorted(resources, key=lambda x: x[1])[:2]
    reporters = rng.sample(crowd, 4)
    db.add_all([
        Report(user_id=reporters[0].id, resource_id=spam.id, reason="spam", details="Not study material, just links to a channel."),
        Report(user_id=reporters[1].id, resource_id=spam.id, reason="spam", details=""),
        Report(user_id=reporters[2].id, resource_id=low[0][0].id, reason="low_quality", details="Pages are mostly repeated."),
        Report(user_id=reporters[3].id, resource_id=low[1][0].id, reason="wrong_subject", details="Looks like it belongs to another unit."),
    ])
    db.commit()

    print("· recomputing counters")
    db.execute(text("""
        UPDATE resources r SET
          star_count = (SELECT count(*) FROM resource_stars s WHERE s.resource_id = r.id),
          bookmark_count = (SELECT count(*) FROM bookmarks b WHERE b.resource_id = r.id),
          rating_count = (SELECT count(*) FROM resource_ratings x WHERE x.resource_id = r.id),
          average_rating = COALESCE((SELECT avg(rating) FROM resource_ratings x WHERE x.resource_id = r.id), 0)
    """))
    db.commit()
    total = db.scalar(select(func.count(Resource.id)))
    print(f"Seeded {total} resources, {db.scalar(select(func.count(User.id)))} users.")
    print("Logins:  admin / admin12345   ·   sanjith / sanjith12345   ·   priya / password123")


if __name__ == "__main__":
    sys.exit(main())
