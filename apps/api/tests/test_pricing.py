"""Price table: fails closed on unknown models, stays in sync with make_model()."""
import pytest

from app.agents import providers
from app.agents.pricing import cost_usd, price_for_model


class TestUnknownModelFailsClosed:
    def test_unknown_model_raises(self) -> None:
        # An unpriced model must never resolve to a $0 cost -- that would
        # let a real, billable run slip past a cost-based spend cap.
        with pytest.raises(ValueError, match="No price-table entry"):
            price_for_model("some-model-nobody-priced")

    def test_cost_usd_also_fails_closed_on_unknown_model(self) -> None:
        with pytest.raises(ValueError, match="No price-table entry"):
            cost_usd("some-model-nobody-priced", input_tokens=100, output_tokens=100)


class TestPriceTableMatchesMakeModel:
    # Every model make_model() can actually construct must have a price --
    # both sides read the same OPENAI_MODEL_NAME/ANTHROPIC_MODEL_NAME/
    # OLLAMA_MODEL_NAME constants, so this fails the build the moment either
    # side changes a model name without updating the other.
    @pytest.mark.parametrize(
        "model_name",
        [providers.OPENAI_MODEL_NAME, providers.ANTHROPIC_MODEL_NAME, providers.OLLAMA_MODEL_NAME],
    )
    def test_every_real_provider_model_is_priced(self, model_name: str) -> None:
        price_for_model(model_name)  # must not raise


class TestCostCalculation:
    def test_cost_scales_with_tokens(self) -> None:
        cost = cost_usd(providers.OPENAI_MODEL_NAME, input_tokens=1_000_000, output_tokens=0)
        price = price_for_model(providers.OPENAI_MODEL_NAME)
        assert cost == pytest.approx(price.input_per_million_usd)

    def test_zero_tokens_is_zero_cost(self) -> None:
        assert cost_usd(providers.ANTHROPIC_MODEL_NAME, input_tokens=0, output_tokens=0) == 0.0

    def test_ollama_is_free(self) -> None:
        cost = cost_usd(
            providers.OLLAMA_MODEL_NAME, input_tokens=1_000_000, output_tokens=1_000_000
        )
        assert cost == 0.0
