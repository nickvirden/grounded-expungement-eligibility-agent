"""make_model() construction: real-provider fix, opt-in gate, credential checks.

Credentials for a real provider (openai, anthropic, ollama) must go through
a Provider object (OpenAIProvider/AnthropicProvider/OllamaProvider) passed
as `provider=` -- none of the model classes accept `api_key=`/`base_url=`
directly, on any of the three. TestOldConstructorPatternRaises below proves
that directly; the rest of this module constructs each provider the correct
way, with dummy credentials, and confirms it returns the right model
class/name, with no real network call made (constructing a Model doesn't
call out to its API).
"""
import pytest
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.test import TestModel

from app.agents import providers
from app.config import settings


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    # Every test in this module drives make_model() through a specific
    # combination of llm_provider/allow_real_llm_providers/credentials --
    # start each one from a known-safe baseline so they can't leak state
    # into each other via the shared `settings` singleton.
    monkeypatch.setattr(settings, "llm_provider", "testmodel")
    monkeypatch.setattr(settings, "allow_real_llm_providers", False)
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "anthropic_api_key", "")


class TestOldConstructorPatternRaises:
    """None of these model classes accept credentials directly -- only via `provider=`."""

    def test_openai_model_rejects_api_key_kwarg(self) -> None:
        with pytest.raises(TypeError, match="api_key"):
            OpenAIChatModel(providers.OPENAI_MODEL_NAME, api_key="sk-dummy")  # type: ignore[call-overload]

    def test_anthropic_model_rejects_api_key_kwarg(self) -> None:
        with pytest.raises(TypeError, match="api_key"):
            AnthropicModel(providers.ANTHROPIC_MODEL_NAME, api_key="sk-ant-dummy")  # type: ignore[call-arg]

    def test_ollama_model_rejects_base_url_kwarg(self) -> None:
        # Ollama's OpenAI-compatible endpoint is reached through
        # OllamaProvider(base_url=...), not by passing base_url=/api_key=
        # straight to OpenAIChatModel -- rejected the same way as the other
        # two, since base_url isn't a parameter it accepts.
        with pytest.raises(TypeError, match="base_url"):
            OpenAIChatModel(  # type: ignore[call-overload]
                providers.OLLAMA_MODEL_NAME, base_url="http://localhost:11434/v1", api_key="ollama"
            )


class TestTestModel:
    def test_testmodel_needs_no_opt_in(self) -> None:
        assert isinstance(providers.make_model(), TestModel)


class TestOptInGate:
    @pytest.mark.parametrize("provider", ["openai", "anthropic", "ollama"])
    def test_real_provider_without_opt_in_raises(
        self, monkeypatch: pytest.MonkeyPatch, provider: str
    ) -> None:
        monkeypatch.setattr(settings, "llm_provider", provider)
        with pytest.raises(RuntimeError, match="ALLOW_REAL_LLM_PROVIDERS"):
            providers.make_model()

    def test_unknown_provider_raises_regardless_of_opt_in(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "llm_provider", "not-a-real-provider")
        with pytest.raises(ValueError, match="Unknown LLM_PROVIDER"):
            providers.make_model()


class TestNoKeyRaises:
    def test_openai_without_key_raises_naming_the_env_var(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "llm_provider", "openai")
        monkeypatch.setattr(settings, "allow_real_llm_providers", True)
        with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
            providers.make_model()

    def test_anthropic_without_key_raises_naming_the_env_var(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "llm_provider", "anthropic")
        monkeypatch.setattr(settings, "allow_real_llm_providers", True)
        with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
            providers.make_model()

    def test_missing_key_error_does_not_leak_a_sibling_secret(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # anthropic_api_key is empty (triggers the raise), but a real secret
        # sits right next to it on the same Settings object -- confirm it
        # never ends up in the exception text, which is what a container's
        # log collector would actually capture.
        monkeypatch.setattr(settings, "llm_provider", "anthropic")
        monkeypatch.setattr(settings, "allow_real_llm_providers", True)
        monkeypatch.setattr(settings, "openai_api_key", "sk-openai-super-secret-value")
        with pytest.raises(RuntimeError) as exc_info:
            providers.make_model()
        assert "super-secret" not in str(exc_info.value)


class TestRealProviderConstruction:
    """Dummy-credential construction only -- no real network call is made."""

    def test_openai_constructs_openai_chat_model(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "llm_provider", "openai")
        monkeypatch.setattr(settings, "allow_real_llm_providers", True)
        monkeypatch.setattr(settings, "openai_api_key", "sk-dummy-openai-key")

        model = providers.make_model()
        assert isinstance(model, OpenAIChatModel)
        assert model.model_name == providers.OPENAI_MODEL_NAME

    def test_anthropic_constructs_anthropic_model(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "llm_provider", "anthropic")
        monkeypatch.setattr(settings, "allow_real_llm_providers", True)
        monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-dummy-key")

        model = providers.make_model()
        assert isinstance(model, AnthropicModel)
        assert model.model_name == providers.ANTHROPIC_MODEL_NAME

    def test_ollama_constructs_ollama_model(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "llm_provider", "ollama")
        monkeypatch.setattr(settings, "allow_real_llm_providers", True)

        model = providers.make_model()
        assert isinstance(model, OllamaModel)
        assert model.model_name == providers.OLLAMA_MODEL_NAME
