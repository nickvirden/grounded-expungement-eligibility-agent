from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./data/eligibility.db"
    allowed_origins: list[str] = Field(default_factory=lambda: ["https://localhost:3000"])

    llm_provider: str = "openai"
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


settings = Settings()
