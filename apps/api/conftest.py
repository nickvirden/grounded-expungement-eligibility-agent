"""Top-level pytest configuration.

Sets environment variables that must be present before any app module is
imported, then bootstraps the test database.
"""
import os

# These must be set before any `from app.*` import in any test module.
os.environ.setdefault("DATABASE_URL", "sqlite:///./data/test_eligibility.db")
os.environ.setdefault("LLM_PROVIDER", "testmodel")
os.environ.setdefault("CSRF_SECRET", "test-csrf-secret-32-chars-minimum!")
# Talk-to-Agent streaming needs this to mint/verify tokens at all -- most of
# the suite exercises the configured-key path. test_stream_token.py's
# subprocess-based tests are the ones that specifically unset this to prove
# a missing key fails closed on only that feature, not on the whole API.
os.environ.setdefault("SSE_SIGNING_KEY", "test-sse-signing-key-32-chars-min!")
# Rate limiting is disabled by default for the suite: the intake-creation
# limit (2/minute) would otherwise trip in any test file that makes more than
# a couple of rapid POST /api/intakes calls. Tests that need to exercise the
# limiter itself (test_rate_limit.py) re-enable it locally.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

import pytest

from app.db import create_db_and_tables


@pytest.fixture(scope="session", autouse=True)
def create_test_tables() -> None:
    """Create all SQLModel tables once per test session.

    Without this, tests that use TestClient without a context manager won't
    trigger the FastAPI lifespan (which normally calls create_db_and_tables),
    resulting in 'no such table' errors.

    This only creates tables on the default SQLite database. Running the suite
    against Postgres (DATABASE_URL=postgresql+psycopg://...) requires
    `alembic upgrade head` first, so the tests exercise the migrated schema.
    """
    create_db_and_tables()
