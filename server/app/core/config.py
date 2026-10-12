"""Application settings. Every value comes from environment variables (or server/.env)."""
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(SERVER_DIR / ".env", SERVER_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = "local"  # local | test | production
    log_level: str = "INFO"
    database_url: str = f"sqlite:///{(SERVER_DIR / 'data' / 'scammind.db').as_posix()}"
    data_dir: Path = SERVER_DIR / "data"
    cors_origins: str = "http://localhost:5173"  # comma separated

    jwt_secret: str = Field(min_length=16)  # required, no default
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7

    admin_email: str | None = None
    admin_password: str | None = None
    admin_name: str = "Administrator"

    login_max_failures: int = 5
    login_window_seconds: int = 900

    logo_max_bytes: int = 2 * 1024 * 1024
    url_check_timeout_seconds: float = 5.0
    url_check_max_redirects: int = 3
    url_check_max_bytes: int = 65536

    # Detection engine: optional LLM scam-intent check. OFF by default; key comes from ANTHROPIC_API_KEY.
    scam_llm_enabled: bool = False
    scam_llm_model: str = "claude-haiku-4-5"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def secret_values(self) -> list[str]:
        return [v for v in (self.jwt_secret, self.admin_password) if v]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


class DatabaseSettings(BaseSettings):
    """Only the DB URL: lets Alembic run without needing JWT_SECRET etc."""

    model_config = SettingsConfigDict(
        env_file=(SERVER_DIR / ".env", SERVER_DIR.parent / ".env"), extra="ignore", case_sensitive=False
    )
    database_url: str = f"sqlite:///{(SERVER_DIR / 'data' / 'scammind.db').as_posix()}"
