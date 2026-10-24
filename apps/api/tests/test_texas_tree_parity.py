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
Wording corrections to a handful of nodes are applied the same way (DECISIONS.md
section 21).
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


_DEFERRED_ADJUDICATION_HELP = (
    "To get deferred adjudication you plead guilty or no contest at the start. "
    "If you violate the terms, you are entitled to a hearing, and the judge can find you guilty "
    "on that plea and sentence you."
)


@pytest.mark.parametrize(
    ("question_id", "answer_position", "field", "absent_fragment", "present_fragment"),
    [
        (
            1,
            3,
            "next_question_help",
            "sealing/expunging",
            "disqualify you from sealing your record",
        ),
        (
            1,
            3,
            "next_question_help",
            "until you either seal or expunge them",
            "unless you get an order of nondisclosure (record sealing). "
            "Except for Class C misdemeanors, deferred adjudication generally cannot be expunged. "
            "Hopefully, you qualify for sealing!",
        ),
        (0, 1, "next_question_help", "ENTER A GUILTY PLEA", _DEFERRED_ADJUDICATION_HELP),
        (
            9,
            1,
            "next_question_text",
            "most misdemeanors in Texas",
            "most felonies in Texas is 3 years",
        ),
        (7, 11, "next_question_text", "over 21", "Are you now at least 21 years old?"),
    ],
    ids=["2-3-sealing", "2-3-expunction", "1-1-deferred-adjudication", "10-1-felonies", "8-11-age"],
)
def test_corrected_wording_replaces_legacy_text(
    question_id: int,
    answer_position: int,
    field: str,
    absent_fragment: str,
    present_fragment: str,
) -> None:
    """Statute-derived wording corrections replace the legacy strings; the legacy trace
    fixture is edited by hand to match (DECISIONS.md section 21)."""
    text = getattr(step("texas", question_id, answer_position), field)

    assert text is not None
    assert absent_fragment not in text
    assert present_fragment in text


def test_corrected_wording_replaces_legacy_text_at_entry_question() -> None:
    help_text = get_entry_question("texas").next_question_help

    assert help_text is not None
    assert "ENTER A GUILTY PLEA" not in help_text
    assert _DEFERRED_ADJUDICATION_HELP in help_text
