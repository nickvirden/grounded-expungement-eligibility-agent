"""Checks the committed Texas tree against an independent trace of the legacy handler.

tests/fixtures/texas_legacy_trace.json is produced by
scripts/trace_legacy_state_tree.mjs, which replays the legacy handler's own
request/response contract with no awareness of how the tree is extracted or
how `rule_engine` represents nodes. Comparing every reachable
(question_id, answer_position) pair against it is a genuine cross-check,
not the same code checking itself.
"""
import json
from pathlib import Path
from typing import Any

import pytest

from app.engine.rule_engine import get_entry_question, step

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "texas_legacy_trace.json"


def _load_trace() -> dict[str, Any]:
    with FIXTURE_PATH.open() as f:
        return json.load(f)  # type: ignore[no-any-return]


_TRACE = _load_trace()
_STEP_CASES = sorted(key for key in _TRACE["trace"] if key != "root")


def test_entry_question_matches_trace_root() -> None:
    root = _TRACE["trace"]["root"]
    entry = get_entry_question("texas")

    assert entry.next_question_id == root["new_question"]["id"]
    assert entry.next_question_text == root["new_question"]["question"]
    assert entry.next_answers == root["new_answers"]
    assert entry.next_question_help == root.get("helpText")
    assert entry.questions_left == root["questionsLeft"]


@pytest.mark.parametrize("key", _STEP_CASES)
def test_step_matches_legacy_trace(key: str) -> None:
    question_id_str, answer_position_str = key.split(":")
    question_id, answer_position = int(question_id_str), int(answer_position_str)
    expected = _TRACE["trace"][key]

    result = step("texas", question_id, answer_position)

    if expected.get("new_question"):
        assert not result.is_terminal, key
        assert result.next_question_id == expected["new_question"]["id"], key
        assert result.next_question_text == expected["new_question"]["question"], key
        assert result.next_answers == expected["new_answers"], key
        assert result.next_question_help == expected.get("helpText"), key
        assert result.questions_left == expected["questionsLeft"], key
    else:
        assert result.is_terminal, key
        assert result.result_label == expected["value"], key


def test_engine_walk_reaches_exactly_the_traced_set() -> None:
    """A full walk through the engine, using only its own returned answers,
    must reach every reachable pair the independent trace found -- nothing
    missing, nothing extra."""
    visited: set[str] = set()
    frontier: list[tuple[int, list[dict[str, Any]]]] = []

    entry = get_entry_question("texas")
    assert entry.next_question_id is not None
    frontier.append((entry.next_question_id, entry.next_answers))

    while frontier:
        question_id, answers = frontier.pop()
        for answer in answers:
            key = f"{question_id}:{answer['position']}"
            if key in visited:
                continue
            visited.add(key)
            result = step("texas", question_id, answer["position"])
            if not result.is_terminal:
                assert result.next_question_id is not None
                frontier.append((result.next_question_id, result.next_answers))

    assert visited == set(_STEP_CASES)
