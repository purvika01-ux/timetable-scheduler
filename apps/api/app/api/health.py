"""Liveness and readiness probes (public; no tenant data)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.core import checks
from app.core.config import Settings, get_settings
from app.core.errors import error_response

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", response_model=None)
def ready(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, str] | JSONResponse:
    results = {
        "database": checks.database_ok(settings),
        "redis": checks.redis_ok(settings),
    }
    down = [name for name, ok in results.items() if not ok]
    if down:
        return error_response(
            503,
            "not_ready",
            f"Service is starting or a dependency is unavailable: {', '.join(down)}.",
        )
    return {"status": "ready"}
