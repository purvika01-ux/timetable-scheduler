"""Settings read from environment variables (never from code or the repo)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "staging", "production"] = "development"
    database_url: str = "postgresql://localhost:5432/timetable"
    redis_url: str = "redis://localhost:6379/0"
    # Exact origins only (D24); comma separated in the environment.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    # Seconds to wait on a dependency before /ready reports it as down.
    ready_timeout_seconds: float = 2.0

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
