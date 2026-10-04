from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_prefix="STUDYVAULT_", extra="ignore")

    database_url: str = "postgresql+psycopg://studyvault:studyvault@localhost:5432/studyvault"
    secret_key: str = "dev-secret-change-me-in-production-0123456789"
    access_token_minutes: int = 60 * 24 * 7

    storage_backend: str = "local"
    storage_dir: Path = BACKEND_DIR / "storage"
    max_upload_mb: int = 20

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
