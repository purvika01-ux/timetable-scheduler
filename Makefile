# Developer commands. Requires Docker (with Compose), uv, and Node/npm.
# The API and worker run in Linux containers for `make dev` (RQ needs fork, which Windows lacks).

.PHONY: help env dev services down test test-api test-web lint lint-api lint-web fmt migrate seed

help:
	@echo "make dev       start db, redis, api, worker, web (Docker)"
	@echo "make services  start only db and redis (Docker)"
	@echo "make down      stop the stack"
	@echo "make test      run API and web tests"
	@echo "make lint      lint and type-check API and web"
	@echo "make fmt       format API and web code"
	@echo "make migrate   apply database migrations (Phase 1)"
	@echo "make seed      load invented sample data (Phase 1)"

env:
	@test -f .env || cp .env.example .env

dev: env
	docker compose up --build

services: env
	docker compose up -d db redis

down:
	docker compose down

test: test-api test-web

test-api:
	cd apps/api && uv run pytest

test-web:
	cd apps/web && npm test

lint: lint-api lint-web

lint-api:
	cd apps/api && uv run ruff check . && uv run ruff format --check . && uv run mypy app

lint-web:
	cd apps/web && npm run lint && npm run typecheck && npm run format:check

fmt:
	cd apps/api && uv run ruff format . && uv run ruff check --fix .
	cd apps/web && npm run format

migrate:
	@echo "No migrations yet: the Alembic baseline arrives in Phase 1."

seed:
	@echo "No seed data yet: the invented sample colleges arrive in Phase 1."
