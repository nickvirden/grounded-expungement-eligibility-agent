"""Intakes router: POST create, GET detail, SSE stream, DELETE for right-to-erasure."""
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.agents.guardrails import GuardrailError, check_jurisdiction, sanitize_narrative
from app.agents.harness import AgentRunner
from app.db import get_session
from app.models import AgentRun, AgentStep, EligibilityResult, Intake
from app.schemas import IntakeCreate

router = APIRouter(prefix="/api/intakes", tags=["intakes"])

_runner = AgentRunner()


@router.post("", status_code=201)
async def create_intake(
    body: IntakeCreate,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """Create an intake record. Returns the intake ID for SSE streaming."""
    try:
        check_jurisdiction(body.state)
    except GuardrailError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

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

    return {"intake_id": intake.id, "status": intake.status}


@router.get("/{intake_id}")
async def get_intake(
    intake_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
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
async def stream_intake(intake_id: str, request: Request) -> StreamingResponse:
    """SSE stream: run the agent for this intake and stream events."""
    # Note: For the demo, we read state/narrative from the existing intake record.
    from sqlmodel import Session as SSession

    from app.db import engine

    with SSession(engine) as session:
        intake = session.get(Intake, intake_id)
        if not intake:
            raise HTTPException(status_code=404, detail="Intake not found")
        state = intake.state
        narrative = intake.narrative_text or ""

    async def event_generator():
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
