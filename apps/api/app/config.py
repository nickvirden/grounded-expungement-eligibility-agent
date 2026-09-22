from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./data/eligibility.db"
    # Prefer a simple env var format (comma-separated) over JSON. This avoids
    # pydantic-settings treating list[str] as a "complex" type requiring JSON.
    allowed_origins: str = Field(default="https://localhost:3000")

    # testmodel is the only provider whose construction actually works today
    # (see app/agents/providers.py) -- openai/anthropic pass api_key directly
    # to the model classes, which the installed pydantic-ai rejects. Default
    # here and fail fast below rather than let a misconfigured deploy crash
    # opaquely at import time via AgentRunner().
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

    @model_validator(mode="after")
    def _reject_unusable_llm_providers(self) -> "Settings":
        # openai/anthropic construction is a known, currently-broken bug in
        # app/agents/providers.py (real Provider-object construction, not a
        # typing issue) -- fixing it is separate, scoped work. Fail loudly
        # and immediately at startup rather than let a misconfigured deploy
        # crash later with a confusing TypeError from deep inside
        # AgentRunner(). ollama stays available as a real, working
        # self-hosted option for anyone who wants a non-testmodel run.
        if self.llm_provider.lower() in ("openai", "anthropic"):
            raise ValueError(
                f"LLM_PROVIDER={self.llm_provider!r} is not usable yet -- its provider "
                "construction is a known bug, not just unconfigured credentials. "
                "Use 'testmodel' (default) or 'ollama' instead."
            )
        return self


settings = Settings()
