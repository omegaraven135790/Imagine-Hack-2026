from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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


@lru_cache
def get_settings() -> Settings:
    return Settings()
