from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.db import engine, is_sqlite
from app.schemas import HealthResponse

router = APIRouter()

_ALEMBIC_INI = Path(__file__).resolve().parent.parent.parent / "alembic.ini"


def _schema_is_current() -> bool:
    """Compare the database's applied migration against the latest available one.

    Only meaningful on Alembic-managed databases (Postgres). SQLite's schema
    comes from create_all, not migrations, by design (see app/db.py) -- there's
    no alembic_version table to check, so it's always considered current.
    """
    if is_sqlite:
        return True

    script = ScriptDirectory.from_config(Config(str(_ALEMBIC_INI)))
    head = script.get_current_head()

    with engine.connect() as conn:
        try:
            current = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        except Exception:
            # Table doesn't exist yet -- e.g. `make up` ran before `make migrate`.
            return False

    return current == head


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    """Liveness: is the process up. Deliberately doesn't check dependencies."""
    return HealthResponse(status="ok")


@router.get("/readyz", response_model=HealthResponse)
async def readyz() -> HealthResponse:
    """Readiness: is the process actually able to serve real traffic.

    Booting against an unmigrated database (the wrong `make up`/`make migrate`
    order) previously passed both health checks and only failed on the first
    real request with a raw "relation does not exist" error -- this makes
    that failure mode loud and immediate instead.
    """
    if not _schema_is_current():
        raise HTTPException(
            status_code=503,
            detail="Database schema is not at the latest migration -- run `make migrate`.",
        )
    return HealthResponse(status="ok")
