from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select

from app.config import get_settings
from app.constants import regulation_for_year
from app.models import Branch, User
from app.routes.deps import DB, CurrentUser
from app.schemas import AuthOut, LoginIn, ProfileUpdate, SignupIn, UserMe
from app.services.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _auth(user: User) -> AuthOut:
    return AuthOut(access_token=create_access_token(user.id), user=UserMe.model_validate(user))


def _branch_id(db, code: str | None) -> int | None:
    if not code:
        return None
    branch = db.scalar(select(Branch).where(Branch.code == code.upper()))
    if not branch:
        raise HTTPException(422, "Unknown branch")
    return branch.id


@router.post("/signup", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, db: DB):
    email = body.email.lower()
    allowed = get_settings().allowed_email_domains
    if allowed and email.rsplit("@", 1)[-1] not in allowed:
        raise HTTPException(422, f"Use your GRIET email ({' / '.join('@' + d for d in allowed)})")
    clash = db.scalar(select(User).where(or_(User.username == body.username, func.lower(User.email) == email)))
    if clash:
        field = "username" if clash.username == body.username else "email"
        raise HTTPException(status.HTTP_409_CONFLICT, f"That {field} is already taken")
    user = User(
        username=body.username,
        email=email,
        full_name=body.full_name.strip(),
        college="GRIET",
        password_hash=hash_password(body.password),
        regulation=regulation_for_year(body.current_year),
        current_year=body.current_year,
        current_semester=body.current_semester,
        branch_id=_branch_id(db, body.branch),
    )
    db.add(user)
    db.commit()
    return _auth(user)


@router.post("/login", response_model=AuthOut)
def login(body: LoginIn, db: DB):
    ident = body.identifier.strip().lower()
    user = db.scalar(select(User).where(or_(User.username == ident, func.lower(User.email) == ident)))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    return _auth(user)


@router.get("/me", response_model=UserMe)
def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserMe)
def update_me(body: ProfileUpdate, user: CurrentUser, db: DB):
    data = body.model_dump(exclude_unset=True)
    if "branch" in data:
        user.branch_id = _branch_id(db, data.pop("branch"))
    for k, v in data.items():
        setattr(user, k, v)
    if "current_year" in data:
        user.regulation = regulation_for_year(user.current_year)
    db.commit()
    db.refresh(user)
    return user
