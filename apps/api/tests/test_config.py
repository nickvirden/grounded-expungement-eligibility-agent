"""Settings' LLM provider default and normalization.

Settings defaults llm_provider to testmodel and only normalizes the value
(case/whitespace) -- it does not reject openai/anthropic/ollama itself; that
check lives in app/agents/providers.py's make_model(), gated by the
allow_real_llm_providers opt-in (see tests/test_providers.py). The app still
fails fast at import time when a real provider is selected without the
opt-in, since AgentRunner() is constructed at import in
app/routers/intakes.py.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings

API_ROOT = Path(__file__).resolve().parent.parent


def _boot_subprocess(env_overrides: dict[str, str]) -> subprocess.CompletedProcess[str]:
    """Import app.main fresh in a clean subprocess.

    conftest.py sets LLM_PROVIDER=testmodel process-wide before any test
    imports app.*, so within this pytest process the true (unset) default
    can never actually be exercised -- app.main is already imported and
    module-cached by the time any test runs. A subprocess is the only way
    to prove the real class-level default (not conftest's override) boots
    the full app, not just Settings() in isolation.
    """
    env = {k: v for k, v in os.environ.items() if k != "LLM_PROVIDER"}
    env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-c", "from app.main import app"],
        cwd=API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )


class TestLlmProviderDefault:
    def test_default_is_testmodel(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # conftest.py sets LLM_PROVIDER=testmodel session-wide (setdefault) so
        # the rest of the suite can run -- unset it here to see the true
        # class-level default, not an environment override of it.
        monkeypatch.delenv("LLM_PROVIDER", raising=False)
        assert Settings().llm_provider == "testmodel"


class TestLlmProviderNormalization:
    @pytest.mark.parametrize(
        "provider", ["openai", "anthropic", "ollama", "OpenAI", "ANTHROPIC", "  Ollama  "]
    )
    def test_accepts_and_normalizes_any_known_provider(self, provider: str) -> None:
        # Settings() only normalizes this value -- whether a real provider
        # is actually usable is app/agents/providers.py's make_model()'s
        # call, gated by the allow_real_llm_providers opt-in.
        assert Settings(llm_provider=provider).llm_provider == provider.strip().lower()

    def test_accepts_testmodel(self) -> None:
        assert Settings(llm_provider="testmodel").llm_provider == "testmodel"

    def test_normalizes_case_and_whitespace(self) -> None:
        # harness.py compares settings.llm_provider == "testmodel" with an
        # exact match -- normalizing here means any casing/whitespace a user
        # actually sets still resolves to the deterministic demo path.
        assert Settings(llm_provider="  TestModel  ").llm_provider == "testmodel"

    def test_empty_env_value_falls_through_to_default(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # .env.example ships LLM_PROVIDER= (present, empty) -- docker-compose
        # loads that verbatim via env_file. Without env_ignore_empty, an
        # empty string is a real value pydantic-settings won't default away
        # from, and it fails downstream in providers.py instead of here.
        monkeypatch.setenv("LLM_PROVIDER", "")
        assert Settings().llm_provider == "testmodel"


class TestAllowRealLlmProviders:
    def test_default_is_off(self) -> None:
        assert Settings().allow_real_llm_providers is False

    def test_can_be_turned_on(self) -> None:
        assert Settings(allow_real_llm_providers=True).allow_real_llm_providers is True


class TestMaxTotalTokens:
    # The spend cap decides "this request is free" from a real provider's
    # price table directly, never from this token count -- but a zero
    # limit would still mean this field bounds nothing, so it's rejected
    # outright rather than accepted as a no-op.
    def test_zero_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            Settings(max_total_tokens=0)

    def test_negative_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            Settings(max_total_tokens=-1)

    def test_positive_is_accepted(self) -> None:
        assert Settings(max_total_tokens=1).max_total_tokens == 1


class TestDatabaseUrlNormalization:
    @pytest.mark.parametrize("scheme", ["postgres://", "postgresql://"])
    def test_bare_postgres_scheme_gets_psycopg_driver(self, scheme: str) -> None:
        url = f"{scheme}user:pass@host/db"
        assert Settings(database_url=url).database_url == "postgresql+psycopg://user:pass@host/db"

    def test_scheme_with_driver_already_set_is_untouched(self) -> None:
        url = "postgresql+psycopg://user:pass@host/db"
        assert Settings(database_url=url).database_url == url

    def test_sqlite_url_is_untouched(self) -> None:
        url = "sqlite:///./data/eligibility.db"
        assert Settings(database_url=url).database_url == url


class TestAppBootsUnderDefaultSettings:
    def test_default_settings_boot_cleanly(self) -> None:
        result = _boot_subprocess({})
        assert result.returncode == 0, result.stderr

    def test_empty_env_value_boots_cleanly(self) -> None:
        # The actual .env.example / docker-compose scenario: LLM_PROVIDER
        # present but empty, not merely absent from the environment.
        result = _boot_subprocess({"LLM_PROVIDER": ""})
        assert result.returncode == 0, result.stderr

    @pytest.mark.parametrize("provider", ["openai", "anthropic", "ollama"])
    def test_real_provider_without_opt_in_fails_fast_at_import(self, provider: str) -> None:
        # AgentRunner() is constructed at import time in
        # app/routers/intakes.py, so make_model()'s opt-in check fails the
        # app's boot immediately, with the error visible on container logs.
        result = _boot_subprocess({"LLM_PROVIDER": provider})
        assert result.returncode != 0
        assert "ALLOW_REAL_LLM_PROVIDERS" in result.stderr
