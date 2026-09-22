"""Settings' LLM provider default and fail-fast guard.

app/agents/providers.py's openai/anthropic construction is a known,
currently-broken bug (real Provider-object construction, not credentials).
Settings must default away from it and reject it outright, rather than let
a misconfigured deploy crash later with a confusing error from deep inside
AgentRunner().
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
    @pytest.mark.parametrize("provider", ["openai", "anthropic", "OpenAI", "ANTHROPIC"])
    def test_rejects_unusable_providers(self, provider: str) -> None:
        with pytest.raises(ValidationError, match="not usable yet"):
            Settings(llm_provider=provider)

    @pytest.mark.parametrize("provider", ["testmodel", "ollama"])
    def test_accepts_usable_providers(self, provider: str) -> None:
        assert Settings(llm_provider=provider).llm_provider == provider


class TestAppBootsUnderDefaultSettings:
    def test_default_settings_boot_cleanly(self) -> None:
        result = _boot_subprocess({})
        assert result.returncode == 0, result.stderr

    def test_openai_fails_fast_at_import(self) -> None:
        result = _boot_subprocess({"LLM_PROVIDER": "openai"})
        assert result.returncode != 0
        assert "not usable yet" in result.stderr
