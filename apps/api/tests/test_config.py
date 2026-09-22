"""Settings' LLM provider default and fail-fast guard.

app/agents/providers.py's openai/anthropic/ollama construction is a known,
currently-broken bug (real Provider-object construction, not credentials).
Settings must default away from it and reject all three outright, rather
than let a misconfigured deploy crash later with a confusing error from
deep inside AgentRunner().
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


class TestLlmProviderGuard:
    @pytest.mark.parametrize(
        "provider", ["openai", "anthropic", "ollama", "OpenAI", "ANTHROPIC", "  Ollama  "]
    )
    def test_rejects_unusable_providers(self, provider: str) -> None:
        with pytest.raises(ValidationError, match="not usable yet"):
            Settings(llm_provider=provider)

    def test_accepts_testmodel(self) -> None:
        assert Settings(llm_provider="testmodel").llm_provider == "testmodel"

    def test_normalizes_case_and_whitespace(self) -> None:
        # harness.py compares settings.llm_provider == "testmodel" with an
        # exact match -- normalizing here means any casing/whitespace a user
        # actually sets still resolves to the deterministic demo path,
        # instead of silently falling through to the real (broken) agent.
        assert Settings(llm_provider="  TestModel  ").llm_provider == "testmodel"

    def test_error_does_not_leak_sibling_secrets(self) -> None:
        # A field_validator's error only ever includes this field's own
        # value -- confirm a secret set alongside an unusable provider
        # doesn't end up in the exception's string representation, which is
        # what a container's log collector would actually capture.
        with pytest.raises(ValidationError) as exc_info:
            Settings(llm_provider="anthropic", anthropic_api_key="sk-ant-super-secret-value")
        assert "super-secret" not in str(exc_info.value)

    def test_empty_env_value_falls_through_to_default(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # .env.example ships LLM_PROVIDER= (present, empty) -- docker-compose
        # loads that verbatim via env_file. Without env_ignore_empty, an
        # empty string is a real value pydantic-settings won't default away
        # from, and it fails downstream in providers.py instead of here.
        monkeypatch.setenv("LLM_PROVIDER", "")
        assert Settings().llm_provider == "testmodel"


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
    def test_unusable_provider_fails_fast_at_import(self, provider: str) -> None:
        result = _boot_subprocess({"LLM_PROVIDER": provider})
        assert result.returncode != 0
        assert "not usable yet" in result.stderr
