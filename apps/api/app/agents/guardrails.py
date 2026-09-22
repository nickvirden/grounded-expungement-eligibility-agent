"""Agent guardrails.

- Max steps cap (prevents infinite loops)
- Confidence threshold (escalates to human review if too uncertain)
- Jurisdiction allowlist (refuses unsupported states politely)
- Prompt-injection sentinel (strips dangerous patterns from user input)
"""
import re

from app.config import settings
from app.engine.tree_loader import list_available_states

_INJECTION_PATTERNS = re.compile(
    r"(ignore previous|disregard|system prompt|you are now|act as|jailbreak"
    r"|<\s*script|javascript:|data:text/html|\x00|\u200b|\u200c|\u200d|\ufeff)",
    re.IGNORECASE,
)

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class GuardrailError(Exception):
    """Raised when a guardrail is violated."""


def check_max_steps(step_count: int) -> None:
    if step_count >= settings.max_agent_steps:
        raise GuardrailError(
            f"Agent exceeded maximum steps ({settings.max_agent_steps}). "
            "Escalating to human review."
        )


def check_confidence(confidence: float) -> None:
    if confidence < settings.confidence_threshold:
        raise GuardrailError(
            f"Confidence {confidence:.2f} below threshold "
            f"{settings.confidence_threshold}. Escalating to human review."
        )


def check_jurisdiction(state: str) -> None:
    available = list_available_states()
    if state.lower() not in available:
        raise GuardrailError(
            f"State '{state}' is not supported. "
            f"Supported states: {', '.join(available)}."
        )


def sanitize_narrative(text: str) -> str:
    """Strip control chars and flag obvious prompt-injection attempts."""
    cleaned = _CONTROL_CHARS.sub("", text)
    cleaned = cleaned.strip()

    if _INJECTION_PATTERNS.search(cleaned):
        raise GuardrailError(
            "Input contains disallowed patterns. Please describe your case "
            "in plain language without any special instructions."
        )

    if len(cleaned) > 4000:
        raise GuardrailError("Narrative exceeds maximum length of 4000 characters.")

    return cleaned
