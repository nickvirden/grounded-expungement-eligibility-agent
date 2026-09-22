from collections.abc import Generator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

_db_url = settings.database_url
is_sqlite = _db_url.startswith("sqlite")
if is_sqlite:
    db_path = _db_url.replace("sqlite:///", "")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    connect_args = {"check_same_thread": False}
else:
    connect_args = {}

engine = create_engine(_db_url, connect_args=connect_args)


def create_db_and_tables() -> None:
    """Create tables directly from the models, for the SQLite dev/test path only.

    Any other database's schema is owned by Alembic (`make migrate`). Running
    create_all there would build tables Alembic never recorded, so the first
    `alembic upgrade head` would then fail on already-existing tables -- and
    schema changes would silently apply on boot, bypassing the explicit
    migration step.
    """
    if is_sqlite:
        SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session]:
    with Session(engine) as session:
        yield session
