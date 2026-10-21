"""Standard error body: {error: {code, message, fields, request_id}}."""

import uuid
from typing import Any

from fastapi.responses import JSONResponse


def error_response(
    status_code: int,
    code: str,
    message: str,
    fields: list[dict[str, str]] | None = None,
) -> JSONResponse:
    # Request-id middleware arrives in Phase 2; until then each error gets a fresh id.
    body: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
            "fields": fields or [],
            "request_id": str(uuid.uuid4()),
        }
    }
    return JSONResponse(status_code=status_code, content=body)
