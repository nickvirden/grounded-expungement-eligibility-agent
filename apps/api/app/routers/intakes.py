"""Intakes router: POST create, GET detail, SSE stream, DELETE for right-to-erasure."""
import json
from collections.abc import AsyncGenerator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.agents.guardrails import GuardrailError, check_jurisdiction, sanitize_narrative
from app.agents.harness import AgentRunner
from app.agents.replay_guard import claim_intake_for_run
from app.agents.spend_cap import SpendCapExceededError
from app.db import engine, get_session
from app.models import AgentRun, AgentStep, EligibilityResult, Intake
from app.schemas import IntakeCreate
from app.security import stream_token
from app.security.rate_limit import intakes_per_minute, limiter
from app.security.stream_token import (
    IntakeMismatchTokenError,
    SigningKeyUnavailableError,
    StreamTokenError,
)

router = APIRouter(prefix="/api/intakes", tags=["intakes"])

_runner = AgentRunner()


@router.post("", status_code=201)
@limiter.limit(intakes_per_minute)
async def create_intake(
    request: Request,  # noqa: ARG001 -- slowapi's decorator inspects the call signature for this exact name
    body: IntakeCreate,
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, Any]:
    """Create an intake record. Returns the intake ID for SSE streaming."""
    try:
        check_jurisdiction(body.state)
    except GuardrailError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    # Only an agent-mode intake ever streams, so only it needs a token.
    # Checked before any row is written: Quick Form intake creation must
    # never fail just because the unrelated Talk-to-Agent feature's signing
    # key is missing, and an agent-mode intake that can't be streamed
    # shouldn't leave a row behind either.
    if body.mode == "agent" and not stream_token.is_configured():
        raise HTTPException(status_code=503, detail="Agent chat unavailable")

    narrative = None
    if body.narrative_text:
        try:
            narrative = sanitize_narrative(body.narrative_text)
        except GuardrailError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e

    intake = Intake(
        mode=body.mode,
        state=body.state.lower(),
        narrative_text=narrative,
        status="pending",
    )
    session.add(intake)
    session.commit()
    session.refresh(intake)

    # is_configured() was already checked above for agent mode, so mint()
    # here should not raise -- but if the key were somehow removed in the
    # instant between the two checks, surfacing that as a 503 is still
    # preferable to a 500, or to returning a row with no way to stream it.
    stream_token_value: str | None = None
    if intake.mode == "agent":
        try:
            stream_token_value = stream_token.mint(intake.id)
        except SigningKeyUnavailableError as e:
            raise HTTPException(status_code=503, detail="Agent chat unavailable") from e

    return {"intake_id": intake.id, "status": intake.status, "stream_token": stream_token_value}


@router.get("/{intake_id}")
async def get_intake(
    intake_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, Any]:
    intake = session.get(Intake, intake_id)
    if not intake:
        raise HTTPException(status_code=404, detail="Intake not found")

    results = session.exec(
        select(EligibilityResult).where(EligibilityResult.intake_id == intake_id)
    ).all()

    runs = session.exec(
        select(AgentRun).where(AgentRun.intake_id == intake_id)
    ).all()

    return {
        "intake_id": intake.id,
        "state": intake.state,
        "mode": intake.mode,
        "status": intake.status,
        "created_at": intake.created_at.isoformat(),
        "results": [
            {
                "result_key": r.result_key,
                "confidence": r.confidence,
                "traversed_path": json.loads(r.traversed_path_json),
                "computed_at": r.computed_at.isoformat(),
            }
            for r in results
        ],
        "agent_runs": [
            {
                "run_id": r.id,
                "status": r.status,
                "provider": r.provider,
                "started_at": r.started_at.isoformat(),
            }
            for r in runs
        ],
    }


@router.get("/{intake_id}/stream")
@limiter.limit(intakes_per_minute)
async def stream_intake(
    request: Request,
    intake_id: str,
) -> StreamingResponse:
    """SSE stream: run the agent for this intake and stream events.

    slowapi's `@limiter.limit` wraps this function itself, so its rate-limit
    check only runs once FastAPI has already resolved every `Depends(...)`
    parameter and is about to call the endpoint body. Any auth check on this
    route must therefore live inside this function body, not in a
    `Depends(...)` -- a dependency rejecting an unauthenticated request
    (401/403) runs *before* this decorator, letting an attacker send
    unlimited unauthenticated requests without ever tripping the limit.

    The bearer token is checked first, before the intake is looked up: an
    invalid token must produce the same response whether or not intake_id
    is real, or the response itself becomes a way to probe which intake IDs
    exist. Only once the token checks out does this route touch the
    database at all.
    """
    auth_header = request.headers.get("authorization") or ""
    scheme, _, token = auth_header.partition(" ")
    bearer_token = token if scheme.lower() == "bearer" and token else None

    try:
        stream_token.verify(bearer_token, intake_id)
    except SigningKeyUnavailableError as e:
        raise HTTPException(status_code=503, detail="Agent chat unavailable") from e
    except IntakeMismatchTokenError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except StreamTokenError as e:
        raise HTTPException(
            status_code=401,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    # Note: For the demo, we read state/narrative from the existing intake record.
    with Session(engine) as session:
        intake = session.get(Intake, intake_id)
        if not intake:
            raise HTTPException(status_code=404, detail="Intake not found")
        state = intake.state
        narrative = intake.narrative_text or ""

    # Checked before the atomic claim below: a request the spend cap refuses
    # must not consume the intake's one-shot claim, or a legitimately
    # cap-blocked intake could never be retried once the cap is raised. The
    # actual enforcement lives inside AgentRunner.run_stream() itself (see
    # app/agents/harness.py) so it protects every caller of the harness, not
    # just this route -- this call surfaces the same check as a clean 503
    # instead of an SSE error event buried inside an already-started stream.
    try:
        _runner.ensure_affordable()
    except SpendCapExceededError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    with Session(engine) as session:
        if not claim_intake_for_run(session, intake_id):
            raise HTTPException(
                status_code=409,
                detail="This intake's agent run has already started or finished",
            )

    async def event_generator() -> AsyncGenerator[str]:
        async for event in _runner.run_stream(intake_id, state, narrative):
            data = json.dumps(event)
            yield f"data: {data}\n\n"
        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.delete("/{intake_id}", status_code=204)
async def delete_intake(
    intake_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Right-to-erasure: delete intake and all associated records (cascade)."""
    intake = session.get(Intake, intake_id)
    if not intake:
        raise HTTPException(status_code=404, detail="Intake not found")

    # Cascade delete: steps → runs → results → intake
    runs = session.exec(select(AgentRun).where(AgentRun.intake_id == intake_id)).all()
    for run in runs:
        steps = session.exec(select(AgentStep).where(AgentStep.run_id == run.id)).all()
        for step in steps:
            session.delete(step)
        session.delete(run)

    results = session.exec(
        select(EligibilityResult).where(EligibilityResult.intake_id == intake_id)
    ).all()
    for result in results:
        session.delete(result)

    session.delete(intake)
    session.commit()
