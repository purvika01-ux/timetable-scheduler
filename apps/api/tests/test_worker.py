import pytest
import redis
from rq import Queue, SimpleWorker

from app.core.config import get_settings
from app.workers.jobs import ping


def test_ping_job_returns_pong() -> None:
    assert ping() == "pong"


@pytest.mark.integration
def test_worker_runs_enqueued_job() -> None:
    connection = redis.Redis.from_url(get_settings().redis_url, socket_connect_timeout=1)
    try:
        connection.ping()
    except redis.RedisError:
        pytest.skip("Redis not reachable")
    queue = Queue("test-phase0", connection=connection)
    job = queue.enqueue(ping)
    # SimpleWorker runs in-process (no fork), so this also works on Windows hosts.
    SimpleWorker([queue], connection=connection).work(burst=True)
    job.refresh()
    assert job.get_status() == "finished"
    assert job.return_value() == "pong"
    queue.delete(delete_jobs=True)


@pytest.mark.integration
def test_database_probe_against_real_postgres() -> None:
    from app.core.checks import database_ok

    settings = get_settings()
    if not database_ok(settings):
        pytest.skip("PostgreSQL not reachable")
    assert database_ok(settings)
