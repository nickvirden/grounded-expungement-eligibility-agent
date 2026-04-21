"""LLM provider abstraction.

Resolves the correct Pydantic AI model from the LLM_PROVIDER env var.
Supports: openai, anthropic, ollama, testmodel (for deterministic tests).
"""
from pydantic_ai.models import Model
from pydantic_ai.models.test import TestModel

from app.config import settings


def make_model() -> Model:
    """Return the configured Pydantic AI model instance."""
    provider = settings.llm_provider.lower()

    if provider == "testmodel":
        return TestModel()

    if provider == "openai":
        from pydantic_ai.models.openai import OpenAIModel
        return OpenAIModel(
            "gpt-4o-mini",
            api_key=settings.openai_api_key or None,
        )

    if provider == "anthropic":
        from pydantic_ai.models.anthropic import AnthropicModel
        return AnthropicModel(
            "claude-3-5-haiku-latest",
            api_key=settings.anthropic_api_key or None,
        )

    if provider == "ollama":
        from pydantic_ai.models.openai import OpenAIModel
        # Ollama exposes an OpenAI-compatible endpoint
        return OpenAIModel(
            "llama3.2",
            base_url=f"{settings.ollama_base_url}/v1",
            api_key="ollama",
        )

    raise ValueError(
        f"Unknown LLM_PROVIDER '{provider}'. "
        "Valid values: openai, anthropic, ollama, testmodel"
    )
