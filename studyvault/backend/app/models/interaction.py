from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import REPORT_REASONS
from app.database import Base
from app.models.resource import Resource
from app.models.user import User


class ResourceStar(Base):
    __tablename__ = "resource_stars"
    __table_args__ = (UniqueConstraint("user_id", "resource_id", name="uq_star_user_resource"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ResourceRating(Base):
    __tablename__ = "resource_ratings"
    __table_args__ = (
        UniqueConstraint("user_id", "resource_id", name="uq_rating_user_resource"),
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_rating_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    rating: Mapped[int] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Bookmark(Base):
    __tablename__ = "bookmarks"
    __table_args__ = (UniqueConstraint("user_id", "resource_id", name="uq_bookmark_user_resource"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    resource: Mapped[Resource] = relationship()


class ResourceView(Base):
    __tablename__ = "resource_views"
    __table_args__ = (Index("ix_views_user_viewed", "user_id", "viewed_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # Nullable: anonymous readers count towards view_count but have no history.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    last_page: Mapped[int] = mapped_column(SmallInteger, default=1, server_default="1")
    viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    resource: Mapped[Resource] = relationship()


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        UniqueConstraint("user_id", "resource_id", name="uq_report_user_resource"),
        CheckConstraint(
            "reason IN (" + ", ".join(f"'{r}'" for r in REPORT_REASONS) + ")", name="ck_report_reason"
        ),
        CheckConstraint("status IN ('open', 'resolved', 'dismissed')", name="ck_report_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    reason: Mapped[str] = mapped_column(String(32))
    details: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="open", server_default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    resource: Mapped[Resource] = relationship()
    reporter: Mapped[User] = relationship()
