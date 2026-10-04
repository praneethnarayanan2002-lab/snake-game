from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    Computed,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import EXAM_TYPES, RESOURCE_TYPES
from app.database import Base
from app.models.subject import Subject, Unit
from app.models.user import User

resource_tags = Table(
    "resource_tags",
    Base.metadata,
    Column("resource_id", ForeignKey("resources.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(48), unique=True, index=True)


def _in_list(column: str, values: dict[str, str]) -> str:
    return f"{column} IN (" + ", ".join(f"'{v}'" for v in values) + ")"


# Weighted document over metadata. tags_text is a denormalised copy of the tag names
# so the vector can be a generated column (generated columns cannot read other tables).
RESOURCE_TSV_EXPR = (
    "setweight(to_tsvector('english', coalesce(title, '')), 'A') || "
    "setweight(to_tsvector('english', coalesce(tags_text, '')), 'B') || "
    "setweight(to_tsvector('english', coalesce(description, '')), 'C')"
)


class Resource(Base):
    __tablename__ = "resources"
    __table_args__ = (
        # Unit must belong to the resource's subject.
        ForeignKeyConstraint(
            ["unit_id", "subject_id"], ["units.id", "units.subject_id"], name="fk_resource_unit_subject"
        ),
        CheckConstraint(_in_list("resource_type", RESOURCE_TYPES), name="ck_resource_type"),
        CheckConstraint(f"exam_type IS NULL OR {_in_list('exam_type', EXAM_TYPES)}", name="ck_exam_type"),
        CheckConstraint("year >= 1990 AND year <= 2100", name="ck_resource_year"),
        CheckConstraint(
            "file_type IN ('pdf', 'document', 'presentation', 'spreadsheet', 'text', 'image')", name="ck_resource_file_type"
        ),
        CheckConstraint("average_rating >= 0 AND average_rating <= 5", name="ck_resource_avg_rating"),
        Index("ix_resources_search_vector", "search_vector", postgresql_using="gin"),
        Index("ix_resources_title_trgm", "title", postgresql_using="gin", postgresql_ops={"title": "gin_trgm_ops"}),
        Index("ix_resources_subject_unit_type", "subject_id", "unit_id", "resource_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    # Storage-backend key; file_url is derived from it so backends stay swappable.
    file_key: Mapped[str] = mapped_column(String(255), unique=True)
    file_name: Mapped[str] = mapped_column(String(255))
    file_size: Mapped[int] = mapped_column(BigInteger, default=0)
    # pdf | document | presentation | spreadsheet | text | image
    file_type: Mapped[str] = mapped_column(String(16), default="pdf", server_default="pdf")
    mime_type: Mapped[str] = mapped_column(String(127), default="application/pdf", server_default="application/pdf")
    page_count: Mapped[int] = mapped_column(Integer, default=0)

    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    unit_id: Mapped[int] = mapped_column(Integer, index=True)
    resource_type: Mapped[str] = mapped_column(String(32), index=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    exam_type: Mapped[str | None] = mapped_column(String(32))

    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    view_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    star_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    rating_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    average_rating: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    bookmark_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    tags_text: Mapped[str] = mapped_column(Text, default="", server_default="")
    search_vector = mapped_column(TSVECTOR, Computed(RESOURCE_TSV_EXPR, persisted=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    subject: Mapped[Subject] = relationship(foreign_keys=[subject_id])
    unit: Mapped[Unit] = relationship(
        primaryjoin="Resource.unit_id == Unit.id", foreign_keys=[unit_id], viewonly=True
    )
    uploader: Mapped[User] = relationship()
    tags: Mapped[list[Tag]] = relationship(secondary=resource_tags, order_by=Tag.name)
    text: Mapped["ResourceText | None"] = relationship(
        back_populates="resource", cascade="all, delete-orphan", uselist=False
    )

    @property
    def file_url(self) -> str:
        return f"/api/resources/{self.id}/file"


class ResourceText(Base):
    """Extracted PDF text, kept apart from resources so list queries stay light."""

    __tablename__ = "resource_texts"
    __table_args__ = (Index("ix_resource_texts_tsv", "tsv", postgresql_using="gin"),)

    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), primary_key=True)
    content: Mapped[str] = mapped_column(Text, default="")
    tsv = mapped_column(TSVECTOR, Computed("to_tsvector('english', coalesce(content, ''))", persisted=True))

    resource: Mapped[Resource] = relationship(back_populates="text")
