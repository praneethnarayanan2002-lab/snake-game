from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    college: Mapped[str | None] = mapped_column(String(160))
    # Academic context drives "your subjects", recommendations and default filters.
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id", ondelete="SET NULL"))
    regulation: Mapped[str | None] = mapped_column(String(8))
    current_year: Mapped[int | None] = mapped_column(Integer)
    current_semester: Mapped[int | None] = mapped_column(Integer)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    branch: Mapped["Branch | None"] = relationship(lazy="joined")  # noqa: F821

    @property
    def branch_code(self) -> str | None:
        return self.branch.code if self.branch else None

    @property
    def branch_name(self) -> str | None:
        return self.branch.name if self.branch else None
