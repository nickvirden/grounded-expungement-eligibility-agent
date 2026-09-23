"""Local USD-per-token price table for real LLM providers.

Never pulled from a live pricing API -- this app's production deployment
stays on LLM_PROVIDER=testmodel by design (see app/config.py's
allow_real_llm_providers), so real-provider pricing only ever needs to
back the one-off manual smoke test in scripts/smoke_test_real_provider.py,
not run at scale. Exact-to-the-cent accuracy doesn't matter here; what does
matter is that an unpriced model fails closed instead of silently
recording a $0 cost, which would let a real, billable run slip past any
cost-based spend cap undetected.
"""
from dataclasses import dataclass

from app.agents.providers import ANTHROPIC_MODEL_NAME, OLLAMA_MODEL_NAME, OPENAI_MODEL_NAME


@dataclass(frozen=True)
class ModelPrice:
    """USD price per 1,000,000 tokens."""

    input_per_million_usd: float
    output_per_million_usd: float


# Approximate list prices, confirmed reasonable as of 2026-09-23. Re-verify
# against each provider's current pricing page before ever running a real
# provider for anything beyond the one-off manual smoke test.
_PRICE_TABLE: dict[str, ModelPrice] = {
    OPENAI_MODEL_NAME: ModelPrice(input_per_million_usd=0.15, output_per_million_usd=0.60),
    ANTHROPIC_MODEL_NAME: ModelPrice(input_per_million_usd=1.00, output_per_million_usd=5.00),
    # Self-hosted Ollama has no per-token vendor price. Genuinely free when
    # actually run against a local daemon -- whether a *remote* Ollama host
    # should still count as free is a spend cap's decision to make (from the
    # configured base_url), not this table's.
    OLLAMA_MODEL_NAME: ModelPrice(input_per_million_usd=0.0, output_per_million_usd=0.0),
}


def price_for_model(model_name: str) -> ModelPrice:
    """Look up a model's price, failing closed on anything unrecognized."""
    try:
        return _PRICE_TABLE[model_name]
    except KeyError:
        raise ValueError(
            f"No price-table entry for model {model_name!r}. Add one to "
            "app/agents/pricing.py before this model can be used."
        ) from None


def cost_usd(model_name: str, input_tokens: int, output_tokens: int) -> float:
    """Return the USD cost of a request, given its token usage."""
    price = price_for_model(model_name)
    return (
        input_tokens / 1_000_000 * price.input_per_million_usd
        + output_tokens / 1_000_000 * price.output_per_million_usd
    )
