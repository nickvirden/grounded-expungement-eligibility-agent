"""Manual-only smoke test for a real LLM provider.

Runs one real request through whichever provider LLM_PROVIDER is
configured for, then prints the resulting stored model, token counts, and
cost for a human to eyeball. This is the one place the real-provider fix
in app/agents/providers.py gets proven against an actual API, not just
test doubles -- done once, by hand, off the record.

Never run in CI, never against a shared/production database: this makes a
real, billable API call whenever LLM_PROVIDER is a real provider, so it
refuses to run at all unless CI is unset and the database is SQLite.

Usage (from apps/api/):
    ALLOW_REAL_LLM_PROVIDERS=true LLM_PROVIDER=openai OPENAI_API_KEY=sk-... \\
        uv run python -m app.scripts.smoke_test_real_provider
"""
import asyncio
import os
import sys

from sqlmodel import Session, select

from app.agents.harness import AgentRunner
from app.config import settings
from app.db import create_db_and_tables, engine
from app.models import AgentRun, Intake


def _refuse_unless_safe() -> None:
    if os.environ.get("CI"):
        print("Refusing to run: CI is set. This script never runs in CI.", file=sys.stderr)  # noqa: T201
        sys.exit(1)
    if not settings.database_url.startswith("sqlite"):
        print(  # noqa: T201
            "Refusing to run: DATABASE_URL is not SQLite. This script never "
            "runs against a shared or production database.",
            file=sys.stderr,
        )
        sys.exit(1)


async def _run_one_intake() -> bool:
    """Return whether the run ended without an error event."""
    create_db_and_tables()

    with Session(engine) as session:
        intake = Intake(
            mode="agent",
            state="texas",
            narrative_text=(
                "I was arrested for a misdemeanor in Texas in 2015 and the "
                "charges were later dismissed."
            ),
            status="pending",
        )
        session.add(intake)
        session.commit()
        session.refresh(intake)
        intake_id = intake.id
        narrative = intake.narrative_text or ""

    runner = AgentRunner()
    ok = True
    async for event in runner.run_stream(intake_id, "texas", narrative):
        print(event)  # noqa: T201
        if event.get("type") == "error":
            ok = False

    with Session(engine) as session:
        runs = session.exec(select(AgentRun).where(AgentRun.intake_id == intake_id)).all()
        for run in runs:
            print(  # noqa: T201
                f"model={run.model!r} status={run.status!r} "
                f"tokens_in={run.total_tokens_in} tokens_out={run.total_tokens_out} "
                f"total_cost_usd={run.total_cost_usd}"
            )

    return ok


def main() -> None:
    _refuse_unless_safe()
    print(f"Running one real request through LLM_PROVIDER={settings.llm_provider!r}...")  # noqa: T201
    ok = asyncio.run(_run_one_intake())
    if not ok:
        print("Run ended in an error event -- see output above.", file=sys.stderr)  # noqa: T201
        sys.exit(1)


if __name__ == "__main__":
    main()
