"""Job functions run by RQ workers. Real jobs (solver, import, export) arrive in later phases."""


def ping() -> str:
    """Smoke-test job: proves a worker picks up and finishes work."""
    return "pong"
