from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# All three real-model constructors in app/agents/providers.py are broken
# today (openai, anthropic, and ollama all pass api_key/base_url directly to
# model classes that reject them -- credentials need a Provider object
# instead). Fixing them is separate, scoped work. testmodel is the only
# provider that actually works right now.
_UNUSABLE_LLM_PROVIDERS = frozenset({"openai", "anthropic", "ollama"})

# Neon (and other managed Postgres providers) inject DATABASE_URL with the
# driver-agnostic "postgres://"/"postgresql://" scheme, but this app's engine
# needs the explicit psycopg3 dialect to actually connect -- a bare scheme
# imports fine locally (SQLAlchemy falls back to whatever psycopg2-compatible
# driver happens to be installed) but fails on Vercel's Python runtime, which
# only has psycopg3 available, with ModuleNotFoundError: no module named
# 'psycopg2'.
_BARE_POSTGRES_SCHEMES = ("postgres://", "postgresql://")


class Settings(BaseSettings):
    # env_ignore_empty: an env var set to "" (e.g. a placeholder line left
    # blank in .env.example, loaded verbatim via docker-compose's env_file)
    # must fall through to the field default, not be treated as an explicit
    # empty value -- otherwise LLM_PROVIDER="" bypasses the intended
    # "unset means testmodel" default and crashes downstream instead.
    # This applies to every field, not just llm_provider -- e.g. a blank
    # DATABASE_URL now falls back to the sqlite default instead of failing
    # loudly. Accepted here (every field already has a sane default, and no
    # deploy sets these to an intentionally-blank value), but revisit if a
    # future field's "blank" and "use the default" meanings genuinely need
    # to differ -- a per-field validator, not this blanket setting, would be
    # the right tool then.
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", env_ignore_empty=True
    )

    database_url: str = "sqlite:///./data/eligibility.db"
    # Prefer a simple env var format (comma-separated) over JSON. This avoids
    # pydantic-settings treating list[str] as a "complex" type requiring JSON.
    allowed_origins: str = Field(default="https://localhost:3000")

    # Default here and fail fast below rather than let a misconfigured
    # deploy crash opaquely at import time via AgentRunner().
    llm_provider: str = "testmodel"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    ollama_base_url: str = "http://ollama:11434"

    csrf_secret: str = ""
    sse_signing_key: str = ""
    session_secret: str = ""

    rate_limit_per_minute: int = 30
    rate_limit_intakes_per_minute: int = 5

    max_agent_steps: int = 8
    max_total_tokens: int = 20_000
    agent_timeout_seconds: int = 60
    confidence_threshold: float = 0.6

    state_trees_dir: str = ""
    service_catalog_path: str = ""

    logfire_token: str = ""
    debug: bool = False

    @property
    def allowed_origins_list(self) -> list[str]:
        return [s.strip() for s in self.allowed_origins.split(",") if s.strip()]

    @field_validator("llm_provider")
    @classmethod
    def _reject_unusable_llm_providers(cls, value: str) -> str:
        # A field_validator only ever sees this field's own value in its
        # error output, unlike a mode="after" model_validator, which embeds
        # the whole (truncated) settings dict -- including the tail of
        # whatever secret happens to sit next to llm_provider, e.g.
        # ANTHROPIC_API_KEY. That's real leakage into container logs for a
        # very plausible misconfiguration (setting a provider and its key
        # together). Normalize case/whitespace here too, since this is the
        # one place that validates the raw value -- downstream comparisons
        # can then trust it's already lowercased and trimmed.
        normalized = value.strip().lower()
        if normalized in _UNUSABLE_LLM_PROVIDERS:
            raise ValueError(
                f"LLM_PROVIDER={value!r} is not usable yet -- its provider construction is "
                "a known bug (see app/agents/providers.py), not just unconfigured "
                "credentials. Use 'testmodel' (the default) instead."
            )
        return normalized

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url_scheme(cls, value: str) -> str:
        for scheme in _BARE_POSTGRES_SCHEMES:
            if value.startswith(scheme):
                return "postgresql+psycopg://" + value[len(scheme) :]
        return value


settings = Settings()
