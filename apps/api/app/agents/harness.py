"""AgentRunner: wraps Pydantic AI with run/step persistence, SSE events, and guardrails."""
import asyncio
import datetime
import json
import time
from collections.abc import AsyncGenerator
import inspect
from typing import Any

import structlog
from pydantic_ai import Agent

from app.agents.eligibility_agent import AgentDeps, EligibilityReport, build_agent
from app.agents.guardrails import GuardrailError, check_confidence, check_max_steps
from app.config import settings
from app.db import engine
from app.models import AgentRun, AgentStep, Intake

log = structlog.get_logger()


class AgentRunner:
    """Runs the eligibility agent and persists every step to the database.

    Emits SSE-compatible events as an async generator so the router can
    stream them directly to the client.
    """

    def __init__(self) -> None:
        self._agent: Agent[AgentDeps, EligibilityReport] = build_agent()

    async def run_stream(
        self,
        intake_id: str,
        state: str,
        narrative: str,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Run the agent and yield SSE event dicts."""
        from sqlmodel import Session, select

        run_id = None

        with Session(engine) as session:
            run = AgentRun(
                intake_id=intake_id,
                provider=settings.llm_provider,
                model="",
                status="running",
            )
            session.add(run)
            session.commit()
            session.refresh(run)
            run_id = run.id

        yield {"type": "run_started", "run_id": run_id}

        step_count = 0
        try:
            async with asyncio.timeout(settings.agent_timeout_seconds):
                # Deterministic no-key path for demos/tests.
                if settings.llm_provider == "testmodel":
                    yield {"type": "text_chunk", "text": "Analyzing your case using the Texas decision tree…"}
                    yield {"type": "text_chunk", "text": "Running deterministic eligibility check…"}

                    # For the showcase, pick the fastest terminal outcome (expungement) so the
                    # full end-to-end path is always completable without an external LLM.
                    final = EligibilityReport(
                        intake_id=intake_id,
                        state=state,
                        result_key=f"{state.lower()}_expungement",
                        result_label=f"{state.title()} Expungement",
                        confidence=1.0,
                        traversed_path=["q1:a1"],
                        recommended_services=[],
                        summary="This is a deterministic demo result produced by TestModel.",
                    )

                    with Session(engine) as session:
                        run_rec = session.get(AgentRun, run_id)
                        if run_rec:
                            run_rec.status = "completed"
                            run_rec.ended_at = datetime.datetime.now(datetime.UTC)
                            session.add(run_rec)

                        step = AgentStep(
                            run_id=run_id,
                            step_idx=step_count + 1,
                            type="final",
                            payload_json=final.model_dump_json(),
                        )
                        session.add(step)
                        session.commit()

                    yield {"type": "final", "report": final.model_dump()}
                    return

                user_prompt = (
                    f"State: {state}\n\n"
                    f"<user_narrative>\n{narrative}\n</user_narrative>\n\n"
                    "Please help me determine my eligibility for record relief."
                )

                async with self._agent.run_stream(
                    user_prompt,
                    deps=AgentDeps(state=state, narrative=narrative),
                ) as result:
                    try:
                        async for text in result.stream_text():
                            check_max_steps(step_count)
                            step_count += 1

                            with Session(engine) as session:
                                step = AgentStep(
                                    run_id=run_id,
                                    step_idx=step_count,
                                    type="llm_chunk",
                                    payload_json=json.dumps({"text": text}),
                                )
                                session.add(step)
                                session.commit()

                            yield {"type": "text_chunk", "text": text}
                    except Exception as e:  # noqa: BLE001
                        # Some models/providers (notably TestModel) can produce non-text
                        # responses where stream_text() is not supported. In that case
                        # we still return a final structured report, just without token streaming.
                        log.info("stream_text_unavailable", error=str(e), run_id=run_id)

                    final = result.get_output()
                    if inspect.isawaitable(final):
                        final = await final
                    # Never trust a model to echo state/intake correctly.
                    final = final.model_copy(update={"intake_id": intake_id, "state": state})
                    check_confidence(final.confidence)

                    with Session(engine) as session:
                        run_rec = session.get(AgentRun, run_id)
                        if run_rec:
                            run_rec.status = "completed"
                            run_rec.ended_at = datetime.datetime.now(datetime.UTC)
                            session.add(run_rec)

                        step = AgentStep(
                            run_id=run_id,
                            step_idx=step_count + 1,
                            type="final",
                            payload_json=final.model_dump_json(),
                        )
                        session.add(step)
                        session.commit()

                    yield {"type": "final", "report": final.model_dump()}

        except GuardrailError as e:
            log.warning("guardrail_triggered", error=str(e), run_id=run_id)
            _mark_run_failed(run_id, str(e))
            yield {"type": "error", "code": "guardrail", "message": str(e)}

        except TimeoutError:
            msg = f"Agent exceeded time limit of {settings.agent_timeout_seconds}s"
            log.error("agent_timeout", run_id=run_id)
            _mark_run_failed(run_id, msg)
            yield {"type": "error", "code": "timeout", "message": msg}

        except Exception as e:  # noqa: BLE001
            log.error("agent_error", error=str(e), run_id=run_id)
            _mark_run_failed(run_id, str(e))
            yield {"type": "error", "code": "internal", "message": "An error occurred"}


def _mark_run_failed(run_id: str, error: str) -> None:
    from sqlmodel import Session

    with Session(engine) as session:
        run = session.get(AgentRun, run_id)
        if run:
            run.status = "failed"
            run.error = error
            run.ended_at = datetime.datetime.now(datetime.UTC)
            session.add(run)
            session.commit()
