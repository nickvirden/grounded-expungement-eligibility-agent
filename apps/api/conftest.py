"""Top-level pytest configuration.

Sets environment variables that must be present before any app module is
imported, then bootstraps the test database.
"""
import os

# These must be set before any `from app.*` import in any test module.
os.environ.setdefault("DATABASE_URL", "sqlite:///./data/test_eligibility.db")
os.environ.setdefault("LLM_PROVIDER", "testmodel")
os.environ.setdefault("CSRF_SECRET", "test-csrf-secret-32-chars-minimum!")

import pytest  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def create_test_tables() -> None:
    """Create all SQLModel tables once per test session.

    Without this, tests that use TestClient without a context manager won't
    trigger the FastAPI lifespan (which normally calls create_db_and_tables),
    resulting in 'no such table' errors.
    """
    from app.db import create_db_and_tables

    create_db_and_tables()
