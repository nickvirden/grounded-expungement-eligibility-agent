"""Deterministic eligibility rule engine.

Walks a state decision tree JSON (produced by scripts/extract_state_tree.mjs)
given a current question ID and answer position, and returns the next state:
either the next question node or a terminal result.

The engine never uses an LLM — all decisions are fully deterministic.
"""
from dataclasses import dataclass, field
from typing import Any

from app.engine.tree_loader import load_service_catalog, load_tree


@dataclass
class StepResult:
    """Result of a single step through the decision tree."""

    is_terminal: bool
    # Terminal fields
    result_key: str | None = None
    result_label: str | None = None
    # Non-terminal fields
    next_question_id: int | None = None
    next_question_text: str | None = None
    next_question_help: str | None = None
    next_answers: list[dict[str, Any]] = field(default_factory=list)
    questions_left: int | None = None


@dataclass
class EligibilityResult:
    """Full eligibility determination with traversal history."""

    result_key: str
    result_label: str
    traversed_path: list[str]
    recommended_service_keys: list[str]
    confidence: float = 1.0


def step(state: str, question_id: int, answer_position: int) -> StepResult:
    """
    Advance one step in the decision tree.

    Args:
        state: Lowercase US state name (e.g. 'texas').
        question_id: Current question node ID.
        answer_position: The position value of the selected answer.

    Returns:
        StepResult indicating the next question or a terminal result.
    """
    tree = load_tree(state)

    # Find the transition for this (question_id, answer_position) pair
    transition = None
    for t in tree["transitions"]:
        if (
            t["from"]["questionId"] == question_id
            and t["from"]["answerPosition"] == answer_position
        ):
            transition = t
            break

    if transition is None:
        raise ValueError(
            f"No transition found for state={state}, "
            f"question_id={question_id}, answer_position={answer_position}"
        )

    target = transition["to"]

    if target["type"] == "result":
        result_value = target["value"]
        return StepResult(
            is_terminal=True,
            result_key=_value_to_key(result_value),
            result_label=result_value,
        )

    # It's a question transition
    next_q_id = target["questionId"]
    node = tree["nodes"].get(str(next_q_id))

    return StepResult(
        is_terminal=False,
        next_question_id=next_q_id,
        next_question_text=target.get("question") or (node["question"] if node else None),
        next_question_help=(node["help"] if node else None),
        next_answers=(node["answers"] if node else []),
        questions_left=node.get("questionsLeft") if node else None,
    )


def get_entry_question(state: str) -> StepResult:
    """
    Return the first question for a state (the root node).

    The legacy system's first call was answered with question 0 → the tree
    returns question 1 as the first real question. We expose node '1' directly.
    """
    tree = load_tree(state)
    node = tree["nodes"].get("1")
    if not node:
        raise ValueError(f"No entry node (id=1) found for state '{state}'")

    return StepResult(
        is_terminal=False,
        next_question_id=1,
        next_question_text=node["question"],
        next_question_help=node.get("help"),
        next_answers=node.get("answers", []),
        questions_left=node.get("questionsLeft"),
    )


def get_recommended_services(result_key: str) -> list[str]:
    """Return service keys that match a given result label."""
    catalog = load_service_catalog()
    matching: list[str] = []
    for svc in catalog.get("services", []):
        if result_key in svc.get("eligibility_keys", []):
            matching.append(svc["key"])
    return matching


def _value_to_key(value: str) -> str:
    """Convert a human-readable result label to a snake_case key."""
    return value.lower().replace(" ", "_").replace("-", "_")
