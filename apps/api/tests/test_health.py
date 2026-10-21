import pytest
from fastapi.testclient import TestClient

from app.core import checks
from app.main import app

client = TestClient(app)


def test_health_returns_200() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready_when_dependencies_up(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(checks, "database_ok", lambda _s: True)
    monkeypatch.setattr(checks, "redis_ok", lambda _s: True)
    response = client.get("/api/v1/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_ready_reports_503_in_standard_error_format(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(checks, "database_ok", lambda _s: False)
    monkeypatch.setattr(checks, "redis_ok", lambda _s: True)
    response = client.get("/api/v1/ready")
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "not_ready"
    assert "database" in error["message"]
    assert error["fields"] == []
    assert error["request_id"]


def test_cors_allows_only_configured_origin() -> None:
    allowed = client.options(
        "/api/v1/health",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:3000"
    denied = client.options(
        "/api/v1/health",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in denied.headers
