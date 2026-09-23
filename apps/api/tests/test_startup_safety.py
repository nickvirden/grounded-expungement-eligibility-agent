"""pydantic_ai.models.ALLOW_MODEL_REQUESTS: the second, independent kill switch.

Set at import time in app/main.py, directly from
settings.allow_real_llm_providers -- not inside the `lifespan` startup hook,
since a serverless Python runtime isn't guaranteed to actually run ASGI
lifespan hooks per invocation. A subprocess is used (rather than importing
app.main in-process, like the rest of this suite does) because
ALLOW_MODEL_REQUESTS is a process-global mutable attribute on
pydantic_ai.models -- flipping it in-process would leak into every other
test that runs afterward in the same session.
"""
import os
import subprocess
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent.parent

_EXCLUDED_ENV_VARS = {"LLM_PROVIDER", "ALLOW_REAL_LLM_PROVIDERS"}

_IMPORT_SCRIPT = (
    "import pydantic_ai.models\n"
    "import app.main\n"
    "print(pydantic_ai.models.ALLOW_MODEL_REQUESTS)\n"
)


def _allow_model_requests_after_import(env_overrides: dict[str, str]) -> str:
    env = {k: v for k, v in os.environ.items() if k not in _EXCLUDED_ENV_VARS}
    env.update(env_overrides)
    # _IMPORT_SCRIPT is a hardcoded module-level literal, never external
    # input -- ruff can't see that statically since it's passed as a
    # variable, same reasoning as test_health_readiness.py's _run_alembic.
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-c", _IMPORT_SCRIPT],
        cwd=API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


class TestAllowModelRequestsKillSwitch:
    def test_off_by_default(self) -> None:
        env = {"LLM_PROVIDER": "testmodel"}
        assert _allow_model_requests_after_import(env) == "False"

    def test_on_when_opted_in(self) -> None:
        # ollama needs no API key to construct, so it's the one real
        # provider whose boot doesn't also require a dummy credential.
        env = {"LLM_PROVIDER": "ollama", "ALLOW_REAL_LLM_PROVIDERS": "true"}
        assert _allow_model_requests_after_import(env) == "True"
