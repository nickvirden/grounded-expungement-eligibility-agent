"""Checks the committed Texas tree against an independent trace of the legacy handler.

tests/fixtures/texas_legacy_trace.json is produced by
scripts/trace_legacy_state_tree.mjs, which replays the legacy handler's own
request/response contract with no awareness of how the tree is extracted or
how `rule_engine` represents nodes. Comparing every reachable
(question_id, answer_position) pair against it is a genuine cross-check,
not the same code checking itself.

Five (question_id, answer_position) pairs intentionally differ from what the
original legacy file produces, so the tree and the fixture are changed together
(DECISIONS.md section 16); the fixture's sourceSha256 still pins that file.
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


@pytest.mark.parametrize(
    ("question_id", "answer_position", "next_question_id", "text_fragment", "answer_positions"),
    [
        (4, 9, 4, "first time offender", [5, 6]),
        (7, 12, 7, "two (2) years since you successfully completed your probation", [13, 14]),
        (7, 15, 7, "Were you a minor when convicted", [11, 18]),
        (7, 18, 8, "organized criminal activity", [2, 12]),
    ],
)
def test_maintained_routing_differs_from_legacy(
    question_id: int,
    answer_position: int,
    next_question_id: int,
    text_fragment: str,
    answer_positions: list[int],
) -> None:
    """The routes the legacy override chain gets wrong (a shadowed DWI override and
    redirects back to already-answered questions) go where the statutes send the user."""
    result = step("texas", question_id, answer_position)

    assert not result.is_terminal
    assert result.next_question_id == next_question_id
    assert result.next_question_text is not None
    assert text_fragment in result.next_question_text
    assert [a["position"] for a in result.next_answers] == answer_positions


def test_answering_that_deferred_probation_is_ongoing_ends_the_walk() -> None:
    result = step("texas", 6, 9)

    assert result.is_terminal
    assert result.result_label == "Does Not Qualify Yet"
