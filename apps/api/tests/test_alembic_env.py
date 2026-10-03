"""alembic/env.py must accept database URLs that contain `%`.

Percent-encoding is how a password with `@`, `/` or `:` has to be written in a
database URL, so a `%` is expected in real credentials. alembic/env.py reads
`settings` at import, so each case runs alembic in a subprocess with
DATABASE_URL overridden.
"""
import os
import subprocess
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent.parent

_PERCENT_ENCODED_CREDENTIALS_URL = "postgresql+psycopg://user:p%40ss%2Fw%3Ard@localhost:5432/appdb"


def _run_alembic(database_url: str, *args: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "DATABASE_URL": database_url}
    # *args is always a hardcoded literal at this file's call sites, never
    # external input -- ruff can't see that statically.
    return subprocess.run(  # noqa: S603
        [sys.executable, "-m", "alembic", *args],
        cwd=API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )


class TestPercentInDatabaseUrl:
    def test_offline_migration_accepts_percent_encoded_password(self) -> None:
        result = _run_alembic(_PERCENT_ENCODED_CREDENTIALS_URL, "upgrade", "head", "--sql")
        assert result.returncode == 0, result.stderr
        assert "CREATE TABLE" in result.stdout

    def test_online_migration_connects_with_the_unescaped_url(self, tmp_path: Path) -> None:
        # A literal `%` in the SQLite path exercises the same ConfigParser
        # round trip as an encoded password, against a database that exists
        # without a server.
        db_file = tmp_path / "pct%db.sqlite"
        result = _run_alembic(f"sqlite:///{db_file}", "upgrade", "head")
        assert result.returncode == 0, result.stderr
        assert db_file.exists()
