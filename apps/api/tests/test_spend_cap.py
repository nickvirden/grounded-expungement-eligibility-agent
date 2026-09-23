"""Daily spend cap: pure boundary behavior, the UTC-midnight cutover, and the
requirement that a remote OLLAMA_BASE_URL never counts as free.

The DB-touching cases (spent_today_usd, ensure_affordable) run against a
dedicated in-memory SQLite engine monkeypatched into app.agents.spend_cap,
not the shared session-scoped test database every other test file writes
AgentRun rows into -- summing "all of today's spend" would otherwise be
sensitive to whatever other tests happened to run first.
"""
import datetime
from collections.abc import Generator

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.agents import pricing, providers, spend_cap
from app.config import settings
from app.models import AgentRun


@pytest.fixture
def isolated_session(monkeypatch: pytest.MonkeyPatch) -> Generator[Session]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(spend_cap, "engine", engine)
    with Session(engine) as session:
        yield session


def _make_run(session: Session, cost_usd: float, started_at: datetime.datetime) -> None:
    run = AgentRun(intake_id="intake-x", provider="openai", total_cost_usd=cost_usd)
    session.add(run)
    session.commit()
    session.refresh(run)
    # started_at has a default_factory, so it must be overwritten after
    # insert to simulate a run from a specific point in time.
    run.started_at = started_at
    session.add(run)
    session.commit()


class TestIsAffordable:
    """Pure function -- no DB, no settings, just the boundary arithmetic."""

    def test_spend_plus_worst_case_exactly_at_cap_is_allowed(self) -> None:
        assert spend_cap.is_affordable(already_spent_usd=0.5, worst_case_usd=0.5, cap_usd=1.0)

    def test_one_cent_over_the_cap_is_refused(self) -> None:
        assert not spend_cap.is_affordable(
            already_spent_usd=0.5, worst_case_usd=0.51, cap_usd=1.0
        )

    def test_zero_cap_refuses_any_positive_worst_case(self) -> None:
        assert not spend_cap.is_affordable(
            already_spent_usd=0.0, worst_case_usd=0.0001, cap_usd=0.0
        )

    def test_zero_cap_allows_a_genuinely_free_request(self) -> None:
        assert spend_cap.is_affordable(already_spent_usd=0.0, worst_case_usd=0.0, cap_usd=0.0)


class TestIsModelFree:
    def test_openai_is_never_free(self) -> None:
        assert not spend_cap.is_model_free(providers.OPENAI_MODEL_NAME)

    def test_anthropic_is_never_free(self) -> None:
        assert not spend_cap.is_model_free(providers.ANTHROPIC_MODEL_NAME)

    @pytest.mark.parametrize(
        "base_url",
        [
            "http://localhost:11434",
            "http://127.0.0.1:11434",
            "http://[::1]:11434",  # IPv6 loopback needs bracket syntax in a URL
            "http://ollama:11434",
        ],
    )
    def test_ollama_is_free_on_a_local_host(
        self, monkeypatch: pytest.MonkeyPatch, base_url: str
    ) -> None:
        monkeypatch.setattr(settings, "ollama_base_url", base_url)
        assert spend_cap.is_model_free(providers.OLLAMA_MODEL_NAME)

    def test_ollama_is_not_free_on_a_remote_host(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # OLLAMA_BASE_URL pointed at a real, possibly-paid host must not be
        # treated as free just because the price table lists $0.0/$0.0 for
        # self-hosted Ollama -- that entry is only valid for a genuinely
        # local daemon.
        monkeypatch.setattr(settings, "ollama_base_url", "http://ollama.example.com:11434")
        assert not spend_cap.is_model_free(providers.OLLAMA_MODEL_NAME)

    def test_unpriced_model_raises_rather_than_answering(self) -> None:
        with pytest.raises(ValueError, match="No price-table entry"):
            spend_cap.is_model_free("a-model-with-no-price-entry")


class TestWorstCaseCost:
    def test_openai_worst_case_is_positive(self) -> None:
        assert spend_cap.worst_case_cost_usd(providers.OPENAI_MODEL_NAME) > 0.0

    def test_anthropic_worst_case_is_positive(self) -> None:
        assert spend_cap.worst_case_cost_usd(providers.ANTHROPIC_MODEL_NAME) > 0.0

    def test_worst_case_uses_the_more_expensive_of_input_and_output_price(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setitem(
            pricing._PRICE_TABLE,
            "lopsided-model",
            pricing.ModelPrice(input_per_million_usd=1.0, output_per_million_usd=9.0),
        )
        monkeypatch.setattr(settings, "max_total_tokens", 1_000_000)
        assert spend_cap.worst_case_cost_usd("lopsided-model") == pytest.approx(9.0)

    def test_local_ollama_worst_case_is_zero(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "ollama_base_url", "http://localhost:11434")
        assert spend_cap.worst_case_cost_usd(providers.OLLAMA_MODEL_NAME) == 0.0


class TestSpentTodayUsd:
    """Every case here pins spent_today_usd()'s notion of "now" via its
    `now` parameter instead of the real wall clock, so these tests are
    deterministic regardless of what day/timezone they actually run in.
    """

    _FIXED_TODAY = datetime.date(2024, 3, 15)
    _FIXED_NOW = datetime.datetime.combine(_FIXED_TODAY, datetime.time(12, 0, 0))

    def test_excludes_a_run_from_just_before_midnight(self, isolated_session: Session) -> None:
        yesterday_2359 = datetime.datetime.combine(
            self._FIXED_TODAY - datetime.timedelta(days=1), datetime.time(23, 59, 59)
        )
        _make_run(isolated_session, cost_usd=5.0, started_at=yesterday_2359)

        assert spend_cap.spent_today_usd(isolated_session, now=self._FIXED_NOW) == 0.0

    def test_includes_a_run_from_exactly_midnight(self, isolated_session: Session) -> None:
        midnight_today = datetime.datetime.combine(self._FIXED_TODAY, datetime.time.min)
        _make_run(isolated_session, cost_usd=3.0, started_at=midnight_today)

        assert spend_cap.spent_today_usd(
            isolated_session, now=self._FIXED_NOW
        ) == pytest.approx(3.0)

    def test_sums_multiple_runs_from_today(self, isolated_session: Session) -> None:
        _make_run(isolated_session, cost_usd=1.5, started_at=self._FIXED_NOW)
        _make_run(isolated_session, cost_usd=2.25, started_at=self._FIXED_NOW)

        assert spend_cap.spent_today_usd(
            isolated_session, now=self._FIXED_NOW
        ) == pytest.approx(3.75)

    def test_no_runs_today_is_zero_not_none(self, isolated_session: Session) -> None:
        assert spend_cap.spent_today_usd(isolated_session, now=self._FIXED_NOW) == 0.0

    def test_a_non_utc_now_is_converted_to_utc_before_taking_the_date(
        self, isolated_session: Session
    ) -> None:
        # 11:30pm on March 15 in a fixed UTC-5 zone is 4:30am UTC on March
        # 16 -- UTC "today" is the 16th, so a run from 11:00pm UTC on the
        # 15th (an hour before the *UTC* midnight) must be excluded. Taking
        # `now`'s date field directly without converting to UTC first would
        # instead compute the 15th as "today" and wrongly include it -- the
        # run's naive UTC timestamp still falls after that wrong midnight.
        utc_minus_5 = datetime.timezone(datetime.timedelta(hours=-5))
        now_in_utc_minus_5 = datetime.datetime(2024, 3, 15, 23, 30, tzinfo=utc_minus_5)
        # Naive, matching how AgentRun.started_at is actually stored (see
        # models.py) -- constructed via .replace() rather than the bare
        # constructor so ruff's DTZ001 doesn't flag a missing tzinfo here.
        run_before_utc_midnight = datetime.datetime(
            2024, 3, 15, 23, 0, tzinfo=datetime.UTC
        ).replace(tzinfo=None)
        _make_run(isolated_session, cost_usd=2.0, started_at=run_before_utc_midnight)

        assert spend_cap.spent_today_usd(isolated_session, now=now_in_utc_minus_5) == 0.0

    def test_defaults_to_the_real_current_instant_when_now_is_omitted(
        self, isolated_session: Session
    ) -> None:
        _make_run(
            isolated_session,
            cost_usd=4.0,
            started_at=datetime.datetime.now(datetime.UTC).replace(tzinfo=None),
        )
        assert spend_cap.spent_today_usd(isolated_session) == pytest.approx(4.0)


@pytest.mark.usefixtures("isolated_session")
class TestEnsureAffordable:
    def test_default_zero_cap_blocks_openai_regardless_of_prior_spend(self) -> None:
        assert settings.daily_spend_cap_usd == 0.0
        with pytest.raises(spend_cap.SpendCapExceededError):
            spend_cap.ensure_affordable(providers.OPENAI_MODEL_NAME)

    def test_testmodel_style_free_model_is_never_blocked(
        self, isolated_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # No dollar amount, however large, should ever block a genuinely
        # free model -- confirmed here by pushing an enormous prior spend
        # into the same day and showing it still doesn't matter.
        monkeypatch.setattr(settings, "ollama_base_url", "http://localhost:11434")
        _make_run(
            isolated_session,
            cost_usd=1_000_000.0,
            started_at=datetime.datetime.now(datetime.UTC).replace(tzinfo=None),
        )
        spend_cap.ensure_affordable(providers.OLLAMA_MODEL_NAME)  # must not raise

    def test_raised_cap_allows_a_real_provider_within_budget(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "daily_spend_cap_usd", 1000.0)
        spend_cap.ensure_affordable(providers.OPENAI_MODEL_NAME)  # must not raise

    def test_raised_cap_still_blocks_once_prior_spend_exhausts_it(
        self, isolated_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "daily_spend_cap_usd", 1.0)
        _make_run(
            isolated_session,
            cost_usd=1.0,
            started_at=datetime.datetime.now(datetime.UTC).replace(tzinfo=None),
        )
        with pytest.raises(spend_cap.SpendCapExceededError):
            spend_cap.ensure_affordable(providers.OPENAI_MODEL_NAME)
