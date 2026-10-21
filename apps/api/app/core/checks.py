"""Dependency probes used by /ready."""

import psycopg
import redis

from app.core.config import Settings


def database_ok(settings: Settings) -> bool:
    try:
        with psycopg.connect(
            settings.database_url, connect_timeout=max(1, int(settings.ready_timeout_seconds))
        ) as conn:
            conn.execute("SELECT 1")
        return True
    except psycopg.Error:
        return False


def redis_ok(settings: Settings) -> bool:
    try:
        client = redis.Redis.from_url(
            settings.redis_url,
            socket_connect_timeout=settings.ready_timeout_seconds,
            socket_timeout=settings.ready_timeout_seconds,
        )
        return bool(client.ping())
    except redis.RedisError:
        return False
