"""LLM provider abstraction.

Resolves the correct Pydantic AI model from the LLM_PROVIDER env var.
Supports: openai, anthropic, ollama, testmodel (for deterministic tests).

Real providers are gated by two independent layers so a misconfigured
deploy can't make a real, billable call by accident: this module's own
`allow_real_llm_providers` check below, and
`pydantic_ai.models.ALLOW_MODEL_REQUESTS`, set at import in app/main.py
whenever that flag is off and enforced inside pydantic-ai's own
OpenAI/Anthropic/Ollama request paths -- independent of whatever happens
here. A daily spend cap, sitting directly in front of every model call
inside the agent harness itself, is a planned third layer, not built yet.
"""
from typing import Final

from pydantic_ai.models import Model
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.test import TestModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.ollama import OllamaProvider
from pydantic_ai.providers.openai import OpenAIProvider

from app.config import settings

# Single source of truth for which model each real provider uses. Also the
# price table's keys in app/agents/pricing.py -- a test there fails the
# build if the two ever drift apart.
OPENAI_MODEL_NAME: Final = "gpt-4o-mini"
ANTHROPIC_MODEL_NAME: Final = "claude-haiku-4-5"
OLLAMA_MODEL_NAME: Final = "llama3.2"

_REAL_PROVIDERS = frozenset({"openai", "anthropic", "ollama"})


def make_model() -> Model:
    """Return the configured Pydantic AI model instance."""
    provider = settings.llm_provider.lower()

    if provider == "testmodel":
        return TestModel()

    if provider not in _REAL_PROVIDERS:
        raise ValueError(
            f"Unknown LLM_PROVIDER '{provider}'. "
            "Valid values: openai, anthropic, ollama, testmodel"
        )

    if not settings.allow_real_llm_providers:
        raise RuntimeError(
            f"LLM_PROVIDER={provider!r} would make real, billable API calls, "
            "but ALLOW_REAL_LLM_PROVIDERS is not set. This app defaults to "
            "$0 spend -- set ALLOW_REAL_LLM_PROVIDERS=true explicitly to use "
            "a real provider."
        )

    if provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError(
                "OPENAI_API_KEY is not set. It is required when LLM_PROVIDER=openai."
            )
        return OpenAIChatModel(
            OPENAI_MODEL_NAME,
            provider=OpenAIProvider(api_key=settings.openai_api_key),
        )

    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. It is required when LLM_PROVIDER=anthropic."
            )
        return AnthropicModel(
            ANTHROPIC_MODEL_NAME,
            provider=AnthropicProvider(api_key=settings.anthropic_api_key),
        )

    # ollama: exposes an OpenAI-compatible endpoint at <base_url>/v1.
    return OllamaModel(
        OLLAMA_MODEL_NAME,
        provider=OllamaProvider(base_url=f"{settings.ollama_base_url}/v1"),
    )
