"""AgentRunner: wraps Pydantic AI with run/step persistence, SSE events, and guardrails."""
import asyncio
import datetime
import inspect
import json
import re
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, Any

import structlog
from sqlmodel import Session

from app.agents.eligibility_agent import AgentDeps, EligibilityReport, build_agent
from app.agents.guardrails import GuardrailError, check_confidence, check_max_steps
from app.config import settings
from app.db import engine
from app.engine import rule_engine
from app.models import AgentRun, AgentStep

if TYPE_CHECKING:
    from pydantic_ai import Agent

log = structlog.get_logger()

_CURRENT_YEAR = datetime.datetime.now(datetime.UTC).year


def _extract_year(text: str) -> int | None:
    # Simple deterministic heuristic for demo runs (not legal reasoning).
    match = re.search(r"\b(19\d{2}|20\d{2})\b", text)
    if not match:
        return None
    year = int(match.group(1))
    if 1900 <= year <= _CURRENT_YEAR:
        return year
    return None


def _choose_answer_position(
    narrative_lc: str,
    question_text_lc: str,
    answers: list[dict[str, Any]],
) -> int:
    """
    Deterministic answer selector for TestModel demo runs.

    Goal: return *varied* outcomes driven by user narrative, without any external LLM.
    This is a best-effort heuristic; when unsure we select an explicit "not sure" option
    if present, otherwise fall back to the first answer.
    """
    year = _extract_year(narrative_lc)
    years_ago = (_CURRENT_YEAR - year) if year else None

    def has(needle: str) -> bool:
        return needle in narrative_lc

    def pick_by_substrings(substrings: list[str]) -> int | None:
        for ans in answers:
            value = str(ans.get("value", "")).lower()
            if any(s in value for s in substrings):
                return int(ans.get("position", 0))
        return None

    # Root mode selection (questionId=0): dismissed / deferred / conviction / juvenile / other.
    if "questionId" in question_text_lc or "outcome of the criminal record" in question_text_lc:
        pass

    # Generic yes/no intent based on narrative.
    if "convict" in question_text_lc:
        if has("not convicted") or has("never convicted") or has("no conviction"):
            pos = pick_by_substrings(["not", "no"])
            if pos is not None:
                return pos
        if has("convicted") or has("plead") or has("guilty"):
            pos = pick_by_substrings(["convicted", "yes", "yeah"])
            if pos is not None:
                return pos
        # If the narrative doesn't mention convictions, prefer the non-conviction option.
        pos = pick_by_substrings(["not convicted", "was not convicted", "no", "not"])
        if pos is not None:
            return pos

    if "felony" in question_text_lc:
        if has("felony"):
            pos = pick_by_substrings(["felony", "yes"])
            if pos is not None:
                return pos
        if has("misdemeanor"):
            pos = pick_by_substrings(["no", "misdemeanor"])
            if pos is not None:
                return pos

    if "dismiss" in question_text_lc and has("dismiss"):
        pos = pick_by_substrings(["dismiss"])
        if pos is not None:
            return pos

    asks_about_vacated = any(
        term in question_text_lc for term in ("acquit", "pardon", "overturned")
    )
    if asks_about_vacated and (has("acquit") or has("pardon") or has("overturn")):
        pos = pick_by_substrings(["acquitted", "pardon", "overturned"])
        if pos is not None:
            return pos

    asks_about_no_charges = "no charges" in question_text_lc or "no charge" in question_text_lc
    if asks_about_no_charges and (
        has("no charges") or has("no charge") or has("never charged") or has("not charged")
    ):
        pos = pick_by_substrings(["no charges", "no charges were filed", "no charges filed"])
        if pos is not None:
            return pos

    if "statute of limitations" in question_text_lc or "enough time" in question_text_lc:
        if years_ago is not None:
            if years_ago >= 5:
                pos = pick_by_substrings(["yes"])
                if pos is not None:
                    return pos
            if years_ago <= 1:
                pos = pick_by_substrings(["no"])
                if pos is not None:
                    return pos
        pos = pick_by_substrings(["not sure", "ask me more"])
        if pos is not None:
            return pos

    # Prefer explicit uncertainty choice when present.
    pos = pick_by_substrings(["not sure", "ask me more", "i'm not sure"])
    if pos is not None:
        return pos

    # Fallback: try to match any answer phrase present in narrative (very rough).
    for ans in answers:
        value = str(ans.get("value", "")).lower()
        if value and value[:20] in narrative_lc:  # small prefix match
            return int(ans.get("position", 0))

    return int(answers[0].get("position", 0)) if answers else 0


def _run_deterministic_demo(state: str, narrative: str) -> tuple[EligibilityReport, list[str]]:
    """
    Deterministic, no-LLM traversal for demos/tests (TestModel provider).
    Returns (final_report, traversed_path).
    """
    narrative_lc = narrative.lower()
    traversed: list[str] = []

    # Choose root path (question_id=0). This decides which “mode” of the tree you enter.
    root_pos = 4  # default DNQ for unknown/unsupported narrative
    if "juvenile" in narrative_lc:
        root_pos = 3
    elif "dismiss" in narrative_lc:
        root_pos = 0
    elif "defer" in narrative_lc or "deferred" in narrative_lc:
        root_pos = 1
    elif "convict" in narrative_lc or "guilty" in narrative_lc or "plea" in narrative_lc:
        root_pos = 2

    cur_q = 0
    cur_pos = root_pos

    for _ in range(24):  # hard cap to avoid infinite loops
        traversed.append(f"q{cur_q}:a{cur_pos}")
        res = rule_engine.step(state.lower(), cur_q, cur_pos)
        if res.is_terminal:
            final = EligibilityReport(
                intake_id="",
                state=state,
                result_key=res.result_key or "",
                result_label=res.result_label or "",
                confidence=1.0,
                traversed_path=traversed,
                recommended_services=[],
                summary="Deterministic demo result (no external LLM).",
            )
            return final, traversed

        # Pick next answer based on narrative + question text
        next_q = res.next_question_id
        if next_q is None:
            break
        question_text_lc = (res.next_question_text or "").lower()
        answers = res.next_answers or []
        cur_q = next_q
        cur_pos = _choose_answer_position(narrative_lc, question_text_lc, answers)

    # If we didn't reach terminal, return Research as safe fallback.
    final = EligibilityReport(
        intake_id="",
        state=state,
        result_key="research",
        result_label="Research",
        confidence=0.6,
        traversed_path=traversed,
        recommended_services=[],
        summary="Unable to deterministically reach a terminal node; fallback to Research.",
    )
    return final, traversed


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
    ) -> AsyncGenerator[dict[str, Any]]:
        """Run the agent and yield SSE event dicts."""
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
                    yield {
                        "type": "text_chunk",
                        "text": f"Analyzing your case using the {state.title()} decision tree…",
                    }
                    yield {"type": "text_chunk", "text": "Running deterministic eligibility check…"}

                    final, _traversed = _run_deterministic_demo(state, narrative)
                    final = final.model_copy(update={"intake_id": intake_id, "state": state})

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
                    except Exception as e:
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

        # These handlers log with `log.error`, not `log.exception`: structlog's
        # ConsoleRenderer (configured in app/main.py) renders tracebacks with frame
        # locals, and this frame holds the user's narrative. `redact_pii` only sees
        # event-dict keys, so a traceback would leak criminal-history PII to the logs.
        except TimeoutError:
            msg = f"Agent exceeded time limit of {settings.agent_timeout_seconds}s"
            log.error("agent_timeout", run_id=run_id)  # noqa: TRY400
            _mark_run_failed(run_id, msg)
            yield {"type": "error", "code": "timeout", "message": msg}

        except Exception as e:
            log.error("agent_error", error=str(e), run_id=run_id)  # noqa: TRY400
            _mark_run_failed(run_id, str(e))
            yield {"type": "error", "code": "internal", "message": "An error occurred"}


def _mark_run_failed(run_id: str, error: str) -> None:
    with Session(engine) as session:
        run = session.get(AgentRun, run_id)
        if run:
            run.status = "failed"
            run.error = error
            run.ended_at = datetime.datetime.now(datetime.UTC)
            session.add(run)
            session.commit()
