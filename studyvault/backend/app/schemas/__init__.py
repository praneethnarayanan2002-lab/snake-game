from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- users / auth ----------
class UserPublic(ORM):
    id: int
    username: str
    full_name: str
    college: str | None = None
    created_at: datetime


class UserMe(UserPublic):
    email: EmailStr
    is_admin: bool


class SignupIn(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_.]+$")
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    college: str | None = Field(default=None, max_length=160)

    @field_validator("username")
    @classmethod
    def lower_username(cls, v: str) -> str:
        return v.lower()


class LoginIn(BaseModel):
    identifier: str = Field(description="Username or email")
    password: str


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserMe


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    college: str | None = Field(default=None, max_length=160)


# ---------- subjects ----------
class UnitOut(ORM):
    id: int
    number: int
    title: str
    topics: str = ""
    resource_count: int = 0


class SubjectBrief(ORM):
    id: int
    slug: str
    code: str
    name: str


class SubjectOut(SubjectBrief):
    description: str
    resource_count: int = 0
    star_count: int = 0
    units: list[UnitOut] = []


class SubjectIn(BaseModel):
    code: str = Field(min_length=1, max_length=16)
    slug: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    aliases: str = ""


class UnitIn(BaseModel):
    number: int = Field(ge=1, le=12)
    title: str = Field(min_length=1, max_length=160)
    topics: str = ""


# ---------- resources ----------
class UnitBrief(ORM):
    id: int
    number: int
    title: str


class Uploader(ORM):
    id: int
    username: str
    full_name: str


class ViewerState(BaseModel):
    starred: bool = False
    bookmarked: bool = False
    my_rating: int | None = None
    reported: bool = False


class ResourceOut(ORM):
    id: int
    title: str
    description: str
    file_url: str
    file_name: str
    file_size: int
    page_count: int
    subject: SubjectBrief
    unit: UnitBrief
    resource_type: str
    resource_type_label: str
    year: int
    exam_type: str | None
    exam_type_label: str | None
    uploader: Uploader
    view_count: int
    star_count: int
    rating_count: int
    average_rating: float
    bookmark_count: int
    tags: list[str]
    created_at: datetime
    viewer: ViewerState | None = None
    score: dict | None = None
    recommended: bool = False


class ResourceUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    subject_id: int | None = None
    unit_id: int | None = None
    resource_type: str | None = None
    year: int | None = Field(default=None, ge=1990, le=2100)
    exam_type: str | None = None
    tags: list[str] | None = None


class ResourcePage(BaseModel):
    items: list[ResourceOut]
    total: int
    limit: int
    offset: int


class SearchOut(ResourcePage):
    parsed: dict
    sort: str


class RatingIn(BaseModel):
    rating: int = Field(ge=1, le=5)


class StatsOut(BaseModel):
    star_count: int
    rating_count: int
    average_rating: float
    bookmark_count: int
    view_count: int
    viewer: ViewerState


class ProgressIn(BaseModel):
    page: int = Field(ge=1, le=10000)


class ReportIn(BaseModel):
    reason: str
    details: str = Field(default="", max_length=1000)


class ReportOut(ORM):
    id: int
    reason: str
    details: str
    status: str
    created_at: datetime
    reporter: Uploader
    resource: ResourceOut | None = None


class ReportUpdate(BaseModel):
    status: str = Field(pattern=r"^(open|resolved|dismissed)$")
