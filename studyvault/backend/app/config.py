from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_prefix="STUDYVAULT_", extra="ignore")

    database_url: str = "postgresql+psycopg://studyvault:studyvault@localhost:5432/studyvault"
    # Serverless (Vercel) must not keep connection pools between invocations, and
    # Supabase's transaction pooler doesn't support prepared statements.
    serverless: bool = False
    secret_key: str = "dev-secret-change-me-in-production-0123456789"
    access_token_minutes: int = 60 * 24 * 7

    storage_backend: str = "local"
    storage_dir: Path = BACKEND_DIR / "storage"
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_bucket: str = "studyvault-pdfs"
    max_upload_mb: int = 20

    # e.g. ["griet.ac.in"] to only allow sign-ups with a college email; empty = anyone.
    allowed_email_domains: list[str] = []

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, v: str) -> str:
        # Supabase/Vercel hand out plain postgres:// URLs; SQLAlchemy needs the driver name.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix) :]
        return v

    @field_validator("supabase_url")
    @classmethod
    def strip_slash(cls, v: str) -> str:
        return v.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
