"""readyz's schema-currency check.

Booting against an unmigrated database (make up before make migrate) used to
report "ok" on both health endpoints and only fail on the first real request
with a raw "relation does not exist" error. readyz now checks the database
is actually at the latest Alembic migration first.

The default test suite runs on SQLite, where this check is a no-op by design
(see app/db.py) -- these tests talk to a real, separate Postgres instance to
exercise the actual check logic, and reset/re-migrate that instance's schema
between cases. Deliberately NOT pointed at CI's api-postgres job's shared
database: these tests drop and recreate tables, which would corrupt whatever
state the rest of that job's pytest run depends on if run against the same
database. Skipped automatically if no Postgres is reachable on the port
below -- run one locally to exercise this suite (see the module docstring's
default URL), or point READYZ_TEST_POSTGRES_URL at an isolated instance.
Wiring a second, isolated database into CI for this is a reasonable
follow-up, not done here to avoid that corruption risk.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine

from app.main import app

API_ROOT = Path(__file__).resolve().parent.parent

_POSTGRES_TEST_URL = os.environ.get(
    "READYZ_TEST_POSTGRES_URL", "postgresql+psycopg://postgres:readyztest@localhost:5557/readyztest"
)


def _postgres_engine() -> Engine:
    return create_engine(_POSTGRES_TEST_URL)


def _postgres_reachable() -> bool:
    try:
        with _postgres_engine().connect():
            return True
    except Exception:
        return False


def _reset_schema(engine: Engine) -> None:
    with engine.connect() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
        for table in ("agentstep", "agentrun", "eligibilityresult", "intake", "service"):
            conn.exec_driver_sql(f"DROP TABLE IF EXISTS {table} CASCADE")
        conn.commit()


def _run_alembic(*args: str) -> None:
    # env.py always resolves the migration target from app.config.settings,
    # which is a singleton already bound to SQLite by conftest.py by the
    # time any test runs -- a subprocess with DATABASE_URL overridden is the
    # only way to actually target the Postgres test instance, same reasoning
    # as test_config.py's boot-subprocess tests.
    env = {**os.environ, "DATABASE_URL": _POSTGRES_TEST_URL}
    # *args is always a hardcoded literal at this test file's own call sites
    # (e.g. _run_alembic("upgrade", "head")), never external input -- ruff
    # can't see that statically since it's a function parameter.
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-m", "alembic", *args],
        cwd=API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stderr


pytestmark = pytest.mark.skipif(
    not _postgres_reachable(),
    reason="No reachable Postgres test instance (set READYZ_TEST_POSTGRES_URL or run one on 5557)",
)


class TestReadyzSchemaCheck:
    def test_rejects_unmigrated_database(self, monkeypatch: pytest.MonkeyPatch) -> None:
        engine = _postgres_engine()
        _reset_schema(engine)  # no alembic_version table at all

        monkeypatch.setattr("app.routers.health.is_sqlite", False)
        monkeypatch.setattr("app.routers.health.engine", engine)

        resp = TestClient(app).get("/readyz")
        assert resp.status_code == 503
        assert "make migrate" in resp.json()["detail"]

    def test_accepts_migrated_database(self, monkeypatch: pytest.MonkeyPatch) -> None:
        engine = _postgres_engine()
        _reset_schema(engine)
        _run_alembic("upgrade", "head")

        monkeypatch.setattr("app.routers.health.is_sqlite", False)
        monkeypatch.setattr("app.routers.health.engine", engine)

        resp = TestClient(app).get("/readyz")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

        _reset_schema(engine)  # leave a clean slate for the next run
