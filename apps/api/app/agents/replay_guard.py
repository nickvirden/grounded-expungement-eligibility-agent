"""Atomic replay guard for intake streaming.

A second SSE stream attempt against an intake that's already running (or
already finished) must not start a second, billable agent run. Guarding
that with "check for an existing run, then act" (a SELECT followed by a
separate UPDATE) is not race-free -- two concurrent requests could both read
status="pending" before either one writes "running". A single conditional
UPDATE, evaluated server-side, closes that window: only the request whose
WHERE clause actually matches a row gets to flip it, under Postgres' READ
COMMITTED isolation and under SQLite's single-writer model alike.
"""
from typing import TYPE_CHECKING

from sqlalchemy import update
from sqlmodel import Session, col

from app.models import Intake

if TYPE_CHECKING:
    from sqlalchemy.engine import CursorResult


def claim_intake_for_run(session: Session, intake_id: str) -> bool:
    """Atomically move intake_id from "pending" to "running".

    Returns True only if this call actually won the claim. Commits its own
    transaction immediately, so the claim is durable before the caller does
    anything else with it (e.g. starting to stream a response) -- the
    caller must not defer this commit or batch it with other work.
    """
    # session.execute() is typed as returning the base sqlalchemy.Result,
    # which has no `rowcount` -- an UPDATE always actually returns the
    # driver's CursorResult, which does.
    result: CursorResult[object] = session.execute(  # type: ignore[assignment]
        update(Intake)
        .where(col(Intake.id) == intake_id, col(Intake.status) == "pending")
        .values(status="running")
    )
    session.commit()
    return result.rowcount > 0
