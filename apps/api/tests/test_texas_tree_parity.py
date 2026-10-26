"""Checks the committed Texas tree against an independent trace of the legacy handler.

tests/fixtures/texas_legacy_trace.json is produced by
scripts/trace_legacy_state_tree.mjs, which replays the legacy handler's own
request/response contract with no awareness of how the tree is extracted or
how `rule_engine` represents nodes. Comparing every reachable
(question_id, answer_position) pair against it is a genuine cross-check,
not the same code checking itself.

Some (question_id, answer_position) pairs intentionally differ from what the
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


def test_declining_to_start_early_after_an_unfiled_misdemeanor_arrest_still_qualifies() -> None:
    """4-4's "No" qualifies the user for expunction: CCP art. 55A.052(a)(2) entitles them to it
    once a year has passed, and 4-4 is only reachable after they said it has. It has its own
    answer position so 4-3's "No" (position 4) keeps ending at Does Not Qualify Yet."""
    declined_early = step("texas", 4, 15)
    still_waiting = step("texas", 4, 4)

    assert declined_early.is_terminal
    assert declined_early.result_label == "Texas Expungement"
    assert still_waiting.is_terminal
    assert still_waiting.result_label == "Does Not Qualify Yet"


def test_answering_that_deferred_probation_is_ongoing_ends_the_walk() -> None:
    result = step("texas", 6, 9)

    assert result.is_terminal
    assert result.result_label == "Does Not Qualify Yet"


_DEFERRED_ADJUDICATION_HELP = (
    "To get deferred adjudication you plead guilty or no contest at the start. "
    "If you violate the terms, you are entitled to a hearing, and the judge can find you guilty "
    "on that plea and sentence you."
)


# (answer reaching the node, node id, chapter, status the node asks about). Sibling nodes share
# one rule sentence apart from the status word, so each carries its own.
_CHAPTER_RULE_NODES = [
    (8, 11, "9-11", 21, "convicted"),
    (10, 6, "10-7", 21, "deferred"),
    (9, 9, "10-9", 46, "convicted"),
    (10, 9, "11-9", 46, "deferred"),
    (11, 5, "12-5", 22, "convicted"),
    (12, 3, "13-3", 22, "deferred"),
    (12, 5, "13-5", 43, "convicted"),
    (13, 3, "14-3", 43, "deferred"),
    (7, 16, "8-16", 71, "convicted"),
]
_CHAPTER_RULE_IDS = [f"{node}-chapter-rule" for _, _, node, _, _ in _CHAPTER_RULE_NODES]


def _chapter_rule_rows() -> list[tuple[int, int, str, str, str]]:
    rows = []
    for question_id, answer_position, _, chapter, status in _CHAPTER_RULE_NODES:
        if status == "deferred":
            absent = "deferred adjudication for or convicted of"
            present = (
                "if you were put on deferred adjudication for a violation of "
                f"Texas Penal Code Chapter {chapter}"
            )
        else:
            absent = "put on deferred adjudication for or"
            present = f"if you were convicted of a violation of Texas Penal Code Chapter {chapter}"
        rows.append((question_id, answer_position, "next_question_help", absent, present))
    return rows


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
        *_chapter_rule_rows(),
        (
            7,
            17,
            "next_question_help",
            "eligible for a Determinate Sentence",
            "<b>Answer YES only if a juvenile court gave you a determinate sentence for one of "
            "the offenses listed below:</b>",
        ),
        (7, 17, "next_question_text", "(found guilty)", 'received a "Determinate Sentence" for'),
        (
            7,
            16,
            "next_question_help",
            "Soliciting Membership in a Street Gang; and",
            "Coercing, Inducing, or Soliciting Membership in a Criminal Street Gang or Foreign "
            "Terrorist Organization; and",
        ),
        (
            7,
            16,
            "next_question_help",
            "Directing Activities of a Street Gang",
            "Directing Activities of Criminal Street Gangs or Foreign Terrorist Organizations",
        ),
        (
            3,
            4,
            "next_question_text",
            "one year isn't a long time",
            "so if you want to get this incident off your record as soon as possible, you should "
            "get things started now.</p><p>Do you want to start the legal process now?</p>",
        ),
        (
            2,
            10,
            "next_question_text",
            "didn't just result in a fine",
            "Before this case, were you ever convicted of, or placed on deferred adjudication for, "
            "any offense other than a traffic offense punishable by fine only?",
        ),
    ],
    ids=[
        "2-3-sealing",
        "2-3-expunction",
        "1-1-deferred-adjudication",
        "10-1-felonies",
        "8-11-age",
        *_CHAPTER_RULE_IDS,
        "8-17-rule",
        "8-17-question",
        "8-16-gang-solicitation",
        "8-16-gang-directing",
        "3-10-question",
        "4-4-question",
    ],
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


@pytest.mark.parametrize(
    ("question_id", "answer_position", "expected_values"),
    [
        (
            7,
            17,
            [
                "Yes, I got a Determinate Sentence of one of the crimes on that list",
                "No, I have not got a Determinate Sentence of any of those offenses",
            ],
        ),
        (
            2,
            10,
            [
                "Yes, I have been convicted or placed on deferred adjudication for a different "
                "offense",
                "No, never (not counting fine-only traffic tickets)",
            ],
        ),
        (
            3,
            4,
            [
                "Yes, I want to get this off my record as soon as possible!",
                "No, I'm not ready to start yet",
            ],
        ),
        (
            8,
            5,
            ["Yes, it has almost been 2 years", "No, I have some time to wait still"],
        ),
    ],
    ids=["8-17-answers", "3-10-answers", "4-4-answers", "9-5-answers"],
)
def test_corrected_wording_replaces_legacy_answers(
    question_id: int, answer_position: int, expected_values: list[str]
) -> None:
    result = step("texas", question_id, answer_position)

    assert [a["value"] for a in result.next_answers] == expected_values


def test_juvenile_entry_answer_covers_cases_that_were_never_adjudicated() -> None:
    values = [a["value"] for a in get_entry_question("texas").next_answers]

    assert "I was convicted as a juvenile" not in values
    assert (
        values[3] == "I had a juvenile case (referred to juvenile probation or juvenile court, "
        "whether or not it was adjudicated)"
    )
