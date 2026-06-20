from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    app_name: str = "ResWatch Retail API"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./reswatch_retail.db"
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value):
        if not isinstance(value, str):
            return value

        cleaned = value.strip()
        if cleaned.lower().startswith("export "):
            cleaned = cleaned.split(" ", 1)[1].strip()
        if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
            cleaned = cleaned[1:-1]
        cleaned = cleaned.replace(">@", "@")
        try:
            parsed = make_url(cleaned)
            if parsed.host and parsed.host.startswith("@"):
                cleaned = str(parsed.set(host=parsed.host.lstrip("@")))
        except Exception:
            pass
        return cleaned

    @field_validator("supabase_url", "supabase_service_role_key", mode="before")
    @classmethod
    def normalize_supabase_value(cls, value):
        if not isinstance(value, str):
            return value

        cleaned = value.strip()
        if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
            cleaned = cleaned[1:-1]
        return cleaned


@lru_cache
def get_settings() -> Settings:
    return Settings()
