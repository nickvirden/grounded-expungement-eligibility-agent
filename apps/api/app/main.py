from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import pydantic_ai.models
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.db import create_db_and_tables
from app.routers import eligibility, health, intakes, states
from app.security.csrf import CSRFMiddleware
from app.security.headers import SecurityHeadersMiddleware
from app.security.origin import StrictOriginMiddleware
from app.security.rate_limit import limiter
from app.security.redaction import redact_pii

structlog.configure(
    processors=[
        redact_pii,
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(0),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

log = structlog.get_logger()

# Independent of app/agents/providers.py's make_model() opt-in check: even if
# that check were somehow bypassed, pydantic-ai's own real OpenAI/Anthropic/
# Ollama request paths still refuse to fire while this is False. TestModel
# never checks this flag, so the testmodel-only default is unaffected either
# way. Set at import time, not inside the `lifespan` startup hook below --
# a serverless Python runtime isn't guaranteed to actually run ASGI lifespan
# hooks per invocation the way a long-running server does, and this must
# hold regardless of that.
pydantic_ai.models.ALLOW_MODEL_REQUESTS = settings.allow_real_llm_providers


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    log.info("starting_up")
    create_db_and_tables()
    yield
    log.info("shutting_down")


app = FastAPI(
    title="ClearSlate Eligibility API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.api_docs_enabled else None,
    redoc_url="/api/redoc" if settings.api_docs_enabled else None,
    # Under /api so the reverse proxy routes it to this service.
    openapi_url="/api/openapi.json" if settings.api_docs_enabled else None,
    swagger_ui_oauth2_redirect_url=None,
)

# State for slowapi
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# Starlette wraps each added middleware around the previous ones, so the last one
# added is outermost: it sees the request first and the response last. Security
# headers are added last so they also cover rejections the other middleware
# produce (CSRF and origin 403s, CORS preflights, rate-limit 429s). Unhandled
# exceptions bypass them: Starlette's ServerErrorMiddleware wraps all user
# middleware and answers with a fixed plain-text 500.
app.add_middleware(StrictOriginMiddleware)
app.add_middleware(CSRFMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token", "X-Request-Id"],
)
# The CDN-loaded docs pages are blank under the strict CSP; the exempt set is
# empty unless the docs are enabled.
app.add_middleware(
    SecurityHeadersMiddleware,
    csp_exempt_paths=frozenset(p for p in (app.docs_url, app.redoc_url) if p),
)

app.include_router(health.router)
app.include_router(eligibility.router)
app.include_router(states.router)
app.include_router(intakes.router)
