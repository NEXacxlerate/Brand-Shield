"""Settings. Everything secret comes from environment variables (see .env.example)."""
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    database_url: str = ""
    data_dir: Path = ROOT / "data"
    secret_key: str = "dev-only-change-me-dev-only-change-me"
    frontend_origin: str = "http://localhost:5173"
    demo_mode: bool = True
    admin_email: str = "admin@company.com"
    admin_name: str = "Harini"
    admin_password: str = "ChangeMe!123"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    rate_limit_enabled: bool = True
    scheduler_enabled: bool = True
    scan_pacing: float = 0.4          # seconds between scan steps so progress is watchable
    env: str = "dev"

    llm_api_key: str = ""
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_model: str = "llama-3.3-70b-versatile"

    virustotal_api_key: str = ""
    abuseipdb_api_key: str = ""
    urlhaus_auth_key: str = ""

    max_apk_mb: int = 100
    max_upload_mb: int = 50
    max_logo_mb: int = 4

    @property
    def db_url(self) -> str:
        return self.database_url or f"sqlite:///{(self.data_dir / 'scammind.db').as_posix()}"

    @property
    def logo_dir(self) -> Path:
        return self.data_dir / "logos"

    @property
    def upload_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def evidence_dir(self) -> Path:
        return self.data_dir / "evidence"

    @property
    def report_dir(self) -> Path:
        return self.data_dir / "reports"

    def ensure_dirs(self):
        for p in (self.data_dir, self.logo_dir, self.upload_dir, self.evidence_dir, self.report_dir):
            p.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.ensure_dirs()
    return s


settings = get_settings()
