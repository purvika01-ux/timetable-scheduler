"""RQ worker entry point: `python -m app.workers.worker`. Runs in a Linux container (needs fork)."""

import redis
from rq import Worker

from app.core.config import get_settings

QUEUES = ["default"]


def main() -> None:
    connection = redis.Redis.from_url(get_settings().redis_url)
    Worker(QUEUES, connection=connection).work(with_scheduler=False)


if __name__ == "__main__":
    main()
