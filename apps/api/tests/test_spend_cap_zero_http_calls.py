"""The $0 spend cap, proven directly: with the real-provider opt-in on, a real
provider selected, and the daily spend cap at its $0 default, the harness
must never make an HTTP call toward a real LLM provider and must never
create an AgentRun row for the attempt.

A counting fake transport (httpx.MockTransport) is wired into the exact
place each provider would otherwise create its own httpx.AsyncClient (see
pydantic_ai.providers.openai/ollama.create_async_http_client) -- if the
spend cap were bypassed, this is the transport that would see the call. Each
provider's negative control has a matching positive control (same setup, cap
raised) that confirms the transport is actually reachable, so a broken cap
check can't pass these tests vacuously.

Testing at the harness level (AgentRunner.run_stream directly), not through
the HTTP router: the cap is enforced inside the harness itself, in front of
every caller -- including ones that never go through the router, like
app/scripts/smoke_test_real_provider.py. Driving only the router wouldn't
prove that.
"""
import httpx
import pydantic_ai.models
import pydantic_ai.providers.ollama as ollama_provider_module
import pydantic_ai.providers.openai as openai_provider_module
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

import app.routers.intakes as intakes_router
from app.agents.harness import AgentRunner
from app.config import settings
from app.db import engine
from app.main import app as fastapi_app
from app.models import AgentRun, Intake
from app.security.csrf import CSRF_COOKIE, CSRF_HEADER, generate_csrf_token

_FAKE_OPENAI_STREAM_BODY = (
    b'data: {"id":"x","object":"chat.completion.chunk","created":0,'
    b'"model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":"hi"},'
    b'"finish_reason":null}]}\n\n'
    b'data: {"id":"x","object":"chat.completion.chunk","created":0,'
    b'"model":"gpt-4o-mini","choices":[{"index":0,"delta":{},'
    b'"finish_reason":"stop"}]}\n\n'
    b"data: [DONE]\n\n"
)


class _CountingTransport:
    """A minimal stand-in for a real LLM endpoint that only counts how many
    times it was actually asked for a response."""

    def __init__(self) -> None:
        self.call_count = 0

    def _handle(self, _request: httpx.Request) -> httpx.Response:
        self.call_count += 1
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content=_FAKE_OPENAI_STREAM_BODY,
        )

    def as_httpx_transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self._handle)


def _create_intake() -> str:
    # A real row, not a made-up ID: SQLite doesn't enforce AgentRun.intake_id's
    # foreign key by default, but Postgres does -- a fabricated ID with no
    # matching Intake row passes locally and fails CI's Postgres job.
    with Session(engine) as session:
        intake = Intake(mode="agent", state="texas")
        session.add(intake)
        session.commit()
        session.refresh(intake)
        return intake.id


def _agent_run_count(intake_id: str) -> int:
    with Session(engine) as session:
        return len(session.exec(select(AgentRun).where(AgentRun.intake_id == intake_id)).all())


def _patch_provider_transport(
    monkeypatch: pytest.MonkeyPatch, provider_module: object
) -> _CountingTransport:
    transport = _CountingTransport()

    def _fake_create_async_http_client(**_kwargs: object) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=transport.as_httpx_transport())

    monkeypatch.setattr(provider_module, "create_async_http_client", _fake_create_async_http_client)
    monkeypatch.setattr(pydantic_ai.models, "ALLOW_MODEL_REQUESTS", True)
    return transport


@pytest.fixture
def real_openai_setup(monkeypatch: pytest.MonkeyPatch) -> _CountingTransport:
    """Configure the harness exactly as a misconfigured-but-opted-in deploy
    would: real provider selected, opt-in on, library kill switch off. Only
    daily_spend_cap_usd is left for each test to set, since that's the one
    thing under test here.
    """
    transport = _patch_provider_transport(monkeypatch, openai_provider_module)
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "allow_real_llm_providers", True)
    monkeypatch.setattr(settings, "openai_api_key", "sk-dummy-openai-key")
    return transport


@pytest.fixture
def remote_ollama_setup(monkeypatch: pytest.MonkeyPatch) -> _CountingTransport:
    """Same idea as real_openai_setup, but for Ollama pointed at a host that
    is not local -- the price table's $0.00/$0.00 entry for Ollama only
    holds for a genuinely local daemon, so this configuration must be
    treated as a real, uncapped-worst-case provider, not a free one.
    """
    transport = _patch_provider_transport(monkeypatch, ollama_provider_module)
    monkeypatch.setattr(settings, "llm_provider", "ollama")
    monkeypatch.setattr(settings, "allow_real_llm_providers", True)
    monkeypatch.setattr(settings, "ollama_base_url", "https://paid-ollama-host.example.com")
    return transport


class TestZeroSpendCapBlocksEveryRealCall:
    async def test_default_cap_makes_zero_http_calls_and_creates_no_run(
        self, real_openai_setup: _CountingTransport
    ) -> None:
        assert settings.daily_spend_cap_usd == 0.0  # the actual default, not overridden here
        intake_id = _create_intake()

        events = [
            event
            async for event in AgentRunner().run_stream(intake_id, "texas", "n/a")
        ]

        assert real_openai_setup.call_count == 0
        assert any(e.get("type") == "error" and e.get("code") == "spend_cap" for e in events)
        assert _agent_run_count(intake_id) == 0

    async def test_positive_control_a_raised_cap_does_reach_the_transport(
        self, real_openai_setup: _CountingTransport, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Same setup as above except the cap -- this is what proves the
        # negative-control test above would actually catch a regression: if
        # the cap check were ever silently skipped, both tests would see
        # call_count == 0, and the negative-control test alone couldn't tell
        # the difference between "the cap worked" and "the check never ran."
        monkeypatch.setattr(settings, "daily_spend_cap_usd", 1000.0)
        intake_id = _create_intake()

        async for _event in AgentRunner().run_stream(intake_id, "texas", "n/a"):
            pass

        assert real_openai_setup.call_count >= 1
        assert _agent_run_count(intake_id) == 1

    async def test_a_zeroed_token_limit_does_not_make_a_priced_provider_free(
        self, real_openai_setup: _CountingTransport, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # worst_case_cost_usd() is max_total_tokens * price, so a zeroed
        # token limit would otherwise compute a $0.00 worst case for a
        # provider that has a real, positive price -- ensure_affordable()
        # must still refuse it, the same as it refuses a model with no
        # price-table entry at all, rather than let a coincidentally-zero
        # arithmetic result read as "this provider is free."
        monkeypatch.setattr(settings, "max_total_tokens", 0)
        intake_id = _create_intake()

        events = [
            event
            async for event in AgentRunner().run_stream(intake_id, "texas", "n/a")
        ]

        assert real_openai_setup.call_count == 0
        assert any(e.get("type") == "error" and e.get("code") == "spend_cap" for e in events)
        assert _agent_run_count(intake_id) == 0


class TestRemoteOllamaIsNotTreatedAsFree:
    """A remote OLLAMA_BASE_URL must be blocked exactly like any other real
    provider -- Ollama only avoids the cap when it's actually running on the
    local host this app itself controls. Self-hosted Ollama has no real
    vendor price, so there's no positive-control variant here the way there
    is for OpenAI: raising daily_spend_cap_usd doesn't help, because a
    remote Ollama host still has no positive worst-case cost to check the
    raised cap against, so ensure_affordable() refuses it unconditionally --
    the same "fail closed on a price we can't verify" behavior as an
    unrecognized model in the price table. The OpenAI positive control above
    already proves the harness/transport wiring itself is sound; this class
    only needs to prove this specific bypass stays closed.
    """

    async def test_default_cap_makes_zero_http_calls_and_creates_no_run(
        self, remote_ollama_setup: _CountingTransport
    ) -> None:
        assert settings.daily_spend_cap_usd == 0.0
        intake_id = _create_intake()

        events = [
            event
            async for event in AgentRunner().run_stream(intake_id, "texas", "n/a")
        ]

        assert remote_ollama_setup.call_count == 0
        assert any(e.get("type") == "error" and e.get("code") == "spend_cap" for e in events)
        assert _agent_run_count(intake_id) == 0

    async def test_raising_the_cap_does_not_unblock_a_remote_ollama_host(
        self, remote_ollama_setup: _CountingTransport, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Unlike OpenAI/Anthropic, an arbitrarily high cap must not open the
        # door here -- a remote Ollama host has no priced worst-case bound
        # to check the cap against in the first place.
        monkeypatch.setattr(settings, "daily_spend_cap_usd", 1_000_000.0)
        intake_id = _create_intake()

        events = [
            event
            async for event in AgentRunner().run_stream(intake_id, "texas", "n/a")
        ]

        assert remote_ollama_setup.call_count == 0
        assert any(e.get("type") == "error" and e.get("code") == "spend_cap" for e in events)
        assert _agent_run_count(intake_id) == 0


def _csrf_client() -> tuple[TestClient, str]:
    token = generate_csrf_token()
    client = TestClient(fastapi_app, cookies={CSRF_COOKIE: token}, raise_server_exceptions=True)
    return client, token


class TestRouterChecksTheCapBeforeClaimingTheIntake:
    """The stream route checks the spend cap before the replay guard's
    atomic claim (see app/routers/intakes.py) specifically so a refused
    request doesn't spend the intake's one-shot claim -- if the order were
    ever swapped, a cap-blocked intake would be stuck at "running" forever,
    unable to retry even after the cap is raised. Driven through the real
    router (not the harness directly, like the tests above) because this
    ordering only exists at the router layer.
    """

    def test_cap_blocked_stream_returns_503_leaves_intake_pending_and_makes_no_calls(
        self, real_openai_setup: _CountingTransport, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        assert settings.daily_spend_cap_usd == 0.0  # the actual default, not overridden here
        # The router's `_runner` is a module-level singleton built once at
        # import time against whatever provider was configured then (always
        # testmodel in this suite) -- replace it so this request actually
        # goes through a real-provider-configured AgentRunner instead of the
        # testmodel one every other test in the suite relies on.
        monkeypatch.setattr(intakes_router, "_runner", AgentRunner())

        client, token = _csrf_client()
        create_resp = client.post(
            "/api/intakes",
            headers={CSRF_HEADER: token},
            json={"mode": "agent", "state": "texas", "narrative_text": "dismissed in 2019"},
        )
        assert create_resp.status_code == 201
        intake_id = create_resp.json()["intake_id"]
        token = create_resp.json()["stream_token"]

        stream_resp = client.get(
            f"/api/intakes/{intake_id}/stream", headers={"Authorization": f"Bearer {token}"}
        )
        assert stream_resp.status_code == 503

        assert real_openai_setup.call_count == 0
        assert _agent_run_count(intake_id) == 0

        with Session(engine) as session:
            intake = session.get(Intake, intake_id)
            assert intake is not None
            # Still "pending", not "running": the atomic claim was never
            # attempted, so this intake can still be streamed later once the
            # cap allows it.
            assert intake.status == "pending"
