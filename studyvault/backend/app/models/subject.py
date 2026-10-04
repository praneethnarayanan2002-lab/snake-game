from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    # Comma-separated search aliases, e.g. "dbms,database,databases".
    aliases: Mapped[str] = mapped_column(Text, default="")

    units: Mapped[list["Unit"]] = relationship(
        back_populates="subject", order_by="Unit.number", cascade="all, delete-orphan"
    )


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
    title: Mapped[str] = mapped_column(String(160))
    topics: Mapped[str] = mapped_column(Text, default="")

    subject: Mapped[Subject] = relationship(back_populates="units")
