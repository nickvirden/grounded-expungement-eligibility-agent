from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

_db_url = settings.database_url
if _db_url.startswith("sqlite"):
    db_path = _db_url.replace("sqlite:///", "")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    connect_args = {"check_same_thread": False}
else:
    connect_args = {}

engine = create_engine(_db_url, connect_args=connect_args)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():  # noqa: ANN201
    with Session(engine) as session:
        yield session
