"""Seed the Service table from packages/shared/service-catalog.json."""
import json
from pathlib import Path

from sqlmodel import Session, select

from app.db import create_db_and_tables, engine
from app.models import Service


def seed() -> None:
    catalog_path = (
        Path(__file__).parents[4] / "packages" / "shared" / "service-catalog.json"
    )
    with catalog_path.open() as f:
        catalog = json.load(f)

    create_db_and_tables()

    with Session(engine) as session:
        for svc in catalog.get("services", []):
            existing = session.exec(select(Service).where(Service.key == svc["key"])).first()
            if existing:
                continue
            session.add(
                Service(
                    key=svc["key"],
                    state=svc["state"],
                    name=svc["name"],
                    description=svc["description"],
                    base_price_usd=svc["base_price_usd"],
                )
            )
        session.commit()
        # A one-shot CLI (`make seed`) reports to the operator's terminal; the app's
        # structlog pipeline is only configured inside the API process.
        print(f"✓ Seeded {len(catalog.get('services', []))} services")  # noqa: T201


if __name__ == "__main__":
    seed()
