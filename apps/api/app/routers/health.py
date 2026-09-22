from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db import engine, is_sqlite
from app.schemas import HealthResponse

router = APIRouter()

_ALEMBIC_INI = Path(__file__).resolve().parent.parent.parent / "alembic.ini"


def _schema_status() -> str | None:
    """Compare the database's applied migration against the latest available one.

    Returns None if the schema is current (always the case on SQLite, whose
    schema comes from create_all, not migrations, by design -- see app/db.py),
    otherwise a message describing what's wrong. Distinguishes three states an
    operator would otherwise have to diagnose from a raw stack trace: the
    database is unreachable, it was never migrated, or its revision doesn't
    match what the running code expects (which direction that mismatch runs
    determines the fix -- `make migrate` or `make up --build`).
    """
    if is_sqlite:
        return None

    try:
        with engine.connect() as conn:
            try:
                current = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            except SQLAlchemyError:
                return "Database has not been migrated -- run `make migrate`."
    except SQLAlchemyError:
        return "Database is unreachable."

    head = ScriptDirectory.from_config(Config(str(_ALEMBIC_INI))).get_current_head()
    if current != head:
        return (
            f"Database schema revision ({current!r}) does not match what the running code "
            f"expects ({head!r}). If you just ran a migration, rebuild and restart the API "
            "(`make up --build`); otherwise run `make migrate`."
        )
    return None


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    """Liveness: is the process up. Deliberately doesn't check dependencies."""
    return HealthResponse(status="ok")


@router.get("/readyz", response_model=HealthResponse)
async def readyz() -> HealthResponse:
    """Readiness: is the process actually able to serve real traffic.

    Distinct from /healthz, which only confirms the process is up -- this
    confirms the database is reachable and at the schema the running code
    expects, so a misconfigured deploy fails here loudly instead of on a
    user's first real request with a raw "relation does not exist" error.
    """
    problem = _schema_status()
    if problem is not None:
        raise HTTPException(status_code=503, detail=problem)
    return HealthResponse(status="ok")
