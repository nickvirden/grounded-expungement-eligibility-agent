"""AgentRun.model/token counts/total_cost_usd get populated, not left at zero.

_record_usage is exercised directly (as the one place all of run_stream's
exit paths -- success, guardrail failure, timeout, and a client disconnect
raising CancelledError/GeneratorExit -- converge to persist usage) rather
than re-driving each of those paths through the full harness, which would
mostly re-test guardrails.py and asyncio.timeout, not this recording logic.
"""
from collections.abc import AsyncIterator

import pytest
from pydantic_ai import RunUsage
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, DeltaToolCalls, FunctionModel
from sqlmodel import Session

from app.agents import pricing, providers
from app.agents.harness import AgentRunner, _record_usage
from app.config import settings
from app.db import engine
from app.models import AgentRun


def _create_run(provider: str = "testmodel") -> str:
    with Session(engine) as session:
        run = AgentRun(intake_id="intake-for-usage-test", provider=provider, status="running")
        session.add(run)
        session.commit()
        session.refresh(run)
        return run.id


def _get_run(run_id: str) -> AgentRun:
    with Session(engine) as session:
        run = session.get(AgentRun, run_id)
        assert run is not None
        return run


class TestRecordUsage:
    def test_no_run_id_is_a_no_op(self) -> None:
        _record_usage(None, "unused", None)  # must not raise

    def test_none_usage_records_zero_cost_and_tokens(self) -> None:
        # Only the deterministic testmodel path ever passes None -- "test"
        # has no price-table entry, so this must skip pricing entirely
        # rather than raise. Every real-provider path passes a RunUsage
        # (see TestUsagePersistsOnFailureBeforeFinalAnswer below for the
        # failure-path case), never None.
        run_id = _create_run()
        _record_usage(run_id, "test", None)

        run = _get_run(run_id)
        assert run.model == "test"
        assert run.total_tokens_in == 0
        assert run.total_tokens_out == 0
        assert run.total_cost_usd == 0.0

    def test_real_usage_computes_cost_from_the_price_table(self) -> None:
        run_id = _create_run(provider="openai")
        usage = RunUsage(input_tokens=10_000, output_tokens=5_000)

        _record_usage(run_id, providers.OPENAI_MODEL_NAME, usage)

        run = _get_run(run_id)
        assert run.model == providers.OPENAI_MODEL_NAME
        assert run.total_tokens_in == 10_000
        assert run.total_tokens_out == 5_000
        assert run.total_cost_usd == pytest.approx(
            pricing.cost_usd(providers.OPENAI_MODEL_NAME, 10_000, 5_000)
        )
        assert run.total_cost_usd > 0.0

    def test_unpriced_model_with_real_usage_raises_instead_of_recording_zero(self) -> None:
        run_id = _create_run(provider="openai")
        usage = RunUsage(input_tokens=1, output_tokens=1)

        with pytest.raises(ValueError, match="No price-table entry"):
            _record_usage(run_id, "a-model-with-no-price-entry", usage)


class TestAgentRunnerModelName:
    def test_testmodel_provider_resolves_model_name_at_construction(self) -> None:
        runner = AgentRunner()
        assert runner._model_name == "test"

    def test_real_provider_with_unpriced_model_fails_at_construction(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # A model make_model() can actually construct must always have a
        # price-table entry in normal operation (see test_pricing.py's own
        # drift test) -- this proves the fallback still fails closed, at
        # construction time, rather than discovering the gap only after a
        # paid call already happened and _record_usage has nowhere to price
        # it.
        monkeypatch.delitem(pricing._PRICE_TABLE, providers.OPENAI_MODEL_NAME)
        monkeypatch.setattr(settings, "llm_provider", "openai")
        monkeypatch.setattr(settings, "allow_real_llm_providers", True)
        monkeypatch.setattr(settings, "openai_api_key", "sk-dummy-openai-key")

        with pytest.raises(ValueError, match="No price-table entry"):
            AgentRunner()


async def _always_call_lookup_state_tree(
    _messages: list[ModelMessage], _info: AgentInfo
) -> AsyncIterator[DeltaToolCalls]:
    # Never produces the structured final-output tool call, so the agent
    # always needs another request -- combined with max_agent_steps=1 below,
    # the second request trips UsageLimitExceeded before run_stream() ever
    # yields a `result`.
    yield {0: DeltaToolCall(name="lookup_state_tree", json_args="{}", tool_call_id="call-1")}


class TestUsagePersistsOnFailureBeforeFinalAnswer:
    """A run that fails before run_stream() yields a `result` object (e.g.
    hitting the request limit while the agent is still calling tools) must
    still record whatever real usage already happened -- a real, billed
    request that's never recorded would let a cost-based spend cap
    undercount actual spend.
    """

    async def test_request_limit_failure_still_records_nonzero_usage(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        fake_model_name = "fake-priced-model-for-tests"
        monkeypatch.setitem(pricing._PRICE_TABLE, fake_model_name, pricing.ModelPrice(1.0, 1.0))

        runner = AgentRunner()
        runner._agent.model = FunctionModel(stream_function=_always_call_lookup_state_tree)
        runner._model_name = fake_model_name

        # llm_provider must be non-testmodel for run_stream() to take the
        # real-agent branch at all; max_agent_steps=1 forces the request
        # limit to trip on the agent's second request.
        monkeypatch.setattr(settings, "llm_provider", "openai")
        monkeypatch.setattr(settings, "max_agent_steps", 1)

        events = [
            event
            async for event in runner.run_stream("intake-for-failure-usage-test", "texas", "n/a")
        ]

        assert any(event.get("type") == "error" for event in events)
        run_id = events[0]["run_id"]

        run = _get_run(run_id)
        assert run.status == "failed"
        assert run.total_tokens_in > 0
        assert run.total_cost_usd > 0.0
