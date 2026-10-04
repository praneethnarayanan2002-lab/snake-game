from sqlalchemy import CheckConstraint, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Branch(Base):
    """A GRIET B.Tech programme, e.g. CSE, CSE (AI & ML), ECE."""

    __tablename__ = "branches"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True)
    name: Mapped[str] = mapped_column(String(120))


class Subject(Base):
    """A GRIET course (one per course code, e.g. GR22A2069 Database Management Systems)."""

    __tablename__ = "subjects"
    __table_args__ = (
        CheckConstraint("year IS NULL OR (year >= 1 AND year <= 4)", name="ck_subject_year"),
        CheckConstraint("semester IS NULL OR semester IN (1, 2)", name="ck_subject_semester"),
        CheckConstraint("kind IN ('theory', 'lab', 'project')", name="ck_subject_kind"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Short display code used in chips and search ("DBMS"); not unique across regulations.
    code: Mapped[str] = mapped_column(String(16), index=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    # Comma-separated search aliases, e.g. "dbms,database".
    aliases: Mapped[str] = mapped_column(Text, default="")

    course_code: Mapped[str | None] = mapped_column(String(16), unique=True)
    regulation: Mapped[str | None] = mapped_column(String(8), index=True)
    year: Mapped[int | None] = mapped_column(Integer)
    semester: Mapped[int | None] = mapped_column(Integer)
    ltpc: Mapped[str] = mapped_column(String(32), default="", server_default="")
    credits: Mapped[float] = mapped_column(Float, default=0, server_default="0")
    kind: Mapped[str] = mapped_column(String(16), default="theory", server_default="theory")
    outcomes: Mapped[str] = mapped_column(Text, default="", server_default="")
    books: Mapped[str] = mapped_column(Text, default="", server_default="")
    lab_tasks: Mapped[str] = mapped_column(Text, default="", server_default="")
    source_url: Mapped[str] = mapped_column(Text, default="", server_default="")

    units: Mapped[list["Unit"]] = relationship(
        back_populates="subject", order_by="Unit.number", cascade="all, delete-orphan"
    )
    offerings: Mapped[list["SubjectOffering"]] = relationship(back_populates="subject", cascade="all, delete-orphan")


class SubjectOffering(Base):
    """Which branches take a course, and in which semester (common courses span branches)."""

    __tablename__ = "subject_offerings"
    __table_args__ = (UniqueConstraint("subject_id", "branch_id", name="uq_offering_subject_branch"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id", ondelete="CASCADE"), index=True)
    year: Mapped[int | None] = mapped_column(Integer)
    semester: Mapped[int | None] = mapped_column(Integer)
    elective: Mapped[str | None] = mapped_column(String(40))

    subject: Mapped[Subject] = relationship(back_populates="offerings")
    branch: Mapped[Branch] = relationship()


class Unit(Base):
    __tablename__ = "units"
    __table_args__ = (
        UniqueConstraint("subject_id", "number", name="uq_unit_subject_number"),
        # Target of resources' composite FK guaranteeing unit/subject consistency.
        UniqueConstraint("id", "subject_id", name="uq_unit_id_subject"),
        CheckConstraint("number >= 1 AND number <= 12", name="ck_unit_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    topics: Mapped[str] = mapped_column(Text, default="")

    subject: Mapped[Subject] = relationship(back_populates="units")
