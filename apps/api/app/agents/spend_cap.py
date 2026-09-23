"""Daily spend cap: the third and final independent layer keeping this app's
real-provider spend at $0 by default (see app/agents/providers.py's own
docstring for the other two -- the opt-in flag and pydantic-ai's library-level
kill switch). Unlike those two, this layer must hold even if the other two
are somehow misconfigured, so "is this request free" is decided by
is_model_free() -- the locality-aware source of truth for Ollama -- not by
whether a worst-case cost computed from the price table and the current
max_total_tokens happens to land on zero. ensure_affordable() below treats
a not-free model with a non-positive worst-case as a configuration it can't
safely price, and refuses it, rather than letting either a remote Ollama
host or an in-process max_total_tokens of 0 slip through as "affordable."
"""
import datetime
from urllib.parse import urlparse

from sqlmodel import Session, func, select

from app.agents import pricing, providers
from app.config import settings
from app.db import engine
from app.models import AgentRun

# The Compose service name ("ollama") is included alongside the usual
# loopback spellings because app/config.py's ollama_base_url default points
# at it by hostname, not an IP -- inside Docker Compose's network that
# resolves to a container this app itself brought up, genuinely local, not a
# third-party host.
_LOCAL_OLLAMA_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "ollama"})


class SpendCapExceededError(RuntimeError):
    """Raised when a request would push today's recorded spend over the cap."""


def _is_ollama_host_local() -> bool:
    return urlparse(settings.ollama_base_url).hostname in _LOCAL_OLLAMA_HOSTS


def is_model_free(model_name: str) -> bool:
    """True only when the price table's own entry for this model is
    genuinely $0 -- Ollama additionally requires its configured host to be
    local, since a remote OLLAMA_BASE_URL could point at a paid host despite
    the price table having no per-token price for it.
    """
    price = pricing.price_for_model(model_name)
    is_zero_priced = price.input_per_million_usd == 0.0 and price.output_per_million_usd == 0.0
    if not is_zero_priced:
        return False
    if model_name == providers.OLLAMA_MODEL_NAME:
        return _is_ollama_host_local()
    return True


def worst_case_cost_usd(model_name: str) -> float:
    """The most this model could cost for one request, at the configured
    token ceiling and the more expensive of its input/output price -- a
    real over-estimate is fine here, an under-estimate is not.
    """
    price = pricing.price_for_model(model_name)
    per_token_usd = max(price.input_per_million_usd, price.output_per_million_usd) / 1_000_000
    return settings.max_total_tokens * per_token_usd


def spent_today_usd(session: Session, now: datetime.datetime | None = None) -> float:
    """Sum of AgentRun.total_cost_usd since UTC midnight (naive, matching
    how AgentRun's timestamp columns are actually stored -- see models.py).

    `now` defaults to the real current instant, injectable for tests so
    "today" can be pinned to a specific instant regardless of the machine's
    own local timezone. A tz-aware `now` is converted to UTC before the date
    is taken; a naive `now` is assumed to already be UTC (matching every
    caller in this codebase) and used as-is -- "today" is always a UTC
    calendar day, never the runner's local one.
    """
    if now is None:
        now = datetime.datetime.now(datetime.UTC)
    elif now.tzinfo is not None:
        now = now.astimezone(datetime.UTC)
    midnight_utc = datetime.datetime.combine(now.date(), datetime.time.min)
    total = session.exec(
        select(func.sum(AgentRun.total_cost_usd)).where(AgentRun.started_at >= midnight_utc)
    ).one()
    return total or 0.0


def is_affordable(already_spent_usd: float, worst_case_usd: float, cap_usd: float) -> bool:
    """Pure boundary check: spend + worst-case landing exactly on the cap is
    still allowed, one cent over is not.
    """
    return already_spent_usd + worst_case_usd <= cap_usd


def ensure_affordable(model_name: str) -> None:
    """Raise SpendCapExceededError unless model_name is free or today's spend
    plus this request's worst case stays within daily_spend_cap_usd.

    is_model_free() is the actual source of truth for "is this free" -- it's
    locality-aware for Ollama, where the price table's own $0.00/$0.00 entry
    only holds for a genuinely local daemon. worst_case_cost_usd() reads that
    same price-table entry with no notion of locality, so a not-free model
    whose worst case still comes back $0.00 (a remote Ollama host, or
    max_total_tokens having been forced to 0 in-process after Settings'
    normal Field(gt=0) validation already ran) must fail closed rather than
    be treated as free by coincidence of arithmetic.
    """
    if is_model_free(model_name):
        return

    worst_case = worst_case_cost_usd(model_name)
    if worst_case <= 0.0:
        raise SpendCapExceededError(
            f"{model_name!r} is not free under the current configuration but has "
            "no positive worst-case cost to bound it against the spend cap -- "
            "refusing rather than treating it as affordable by default."
        )

    with Session(engine) as session:
        already_spent = spent_today_usd(session)

    if not is_affordable(already_spent, worst_case, settings.daily_spend_cap_usd):
        raise SpendCapExceededError(
            f"Daily spend cap of ${settings.daily_spend_cap_usd:.2f} would be exceeded: "
            f"${already_spent:.4f} already spent today, this request could cost up to "
            f"${worst_case:.4f} more."
        )
