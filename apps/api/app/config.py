from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Neon (and other managed Postgres providers) inject DATABASE_URL with the
# driver-agnostic "postgres://"/"postgresql://" scheme, but this app's engine
# needs the explicit psycopg3 dialect to actually connect. A bare scheme
# fails everywhere this app runs, not just on Vercel: SQLAlchemy 1.4+ has no
# "postgres" dialect at all (ModuleNotFoundError: no module named
# 'psycopg2'), and "postgresql://" without a driver suffix only works if
# psycopg2 happens to be installed, which it isn't here (this app uses
# psycopg3 exclusively).
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

    # testmodel needs no credentials and makes no real request. Selecting a
    # real provider (openai/anthropic/ollama) is checked in app/agents/
    # providers.py's make_model(), not here -- see allow_real_llm_providers
    # below for why that check lives there instead of a validator on this
    # field.
    llm_provider: str = "testmodel"
    # A real provider (openai/anthropic/ollama) only makes real, billable API
    # calls once this is explicitly turned on. Checked in
    # app/agents/providers.py's make_model() as a plain RuntimeError, not
    # here as a model_validator -- a validator's error output embeds the
    # whole (truncated) settings dict, which would leak whatever API key
    # happens to be set alongside this flag into container logs. This is the
    # first of two independent layers keeping the default at $0 spend: the
    # second is pydantic_ai.models.ALLOW_MODEL_REQUESTS, flipped off at
    # startup in app/main.py whenever this flag is off, and checked directly
    # inside pydantic-ai's own real OpenAI/Anthropic request paths.
    allow_real_llm_providers: bool = False
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    ollama_base_url: str = "http://ollama:11434"

    csrf_secret: str = ""
    sse_signing_key: str = ""
    session_secret: str = ""

    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 30
    rate_limit_intakes_per_minute: int = 2

    max_agent_steps: int = 8
    # gt=0: a planned $0-by-default spend cap is meant to infer "this
    # request is worst-case free" from a real provider's price table, never
    # from a token count that could be zeroed out -- but a zero limit here
    # would still mean this field bounds nothing, which defeats the point of
    # having a token limit at all.
    max_total_tokens: int = Field(default=20_000, gt=0)
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
    def _normalize_llm_provider(cls, value: str) -> str:
        # Normalize case/whitespace here, since this is the one place that
        # validates the raw value -- downstream comparisons (make_model(),
        # harness.py's testmodel check) can then trust it's already
        # lowercased and trimmed, regardless of how a user actually set the
        # env var.
        return value.strip().lower()

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url_scheme(cls, value: str) -> str:
        for scheme in _BARE_POSTGRES_SCHEMES:
            if value.startswith(scheme):
                return "postgresql+psycopg://" + value[len(scheme) :]
        return value


settings = Settings()
