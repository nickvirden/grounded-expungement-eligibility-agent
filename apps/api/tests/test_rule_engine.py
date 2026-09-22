"""Tests for the deterministic eligibility rule engine."""
import json
from pathlib import Path
from typing import Any

import pytest

from app.engine.rule_engine import get_entry_question, step
from app.engine.tree_loader import list_available_states, load_tree

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict[str, Any]:
    with (FIXTURES_DIR / name).open() as f:
        fixture: dict[str, Any] = json.load(f)
    return fixture


class TestRuleEngine:
    def test_texas_expungement_terminal(self) -> None:
        fixture = load_fixture("texas_expungement.json")
        result = step(fixture["state"], fixture["question_id"], fixture["answer_position"])
        assert result.is_terminal is True
        assert result.result_label == fixture["expected_result"]
        assert result.result_key is not None

    def test_texas_dnq_terminal(self) -> None:
        fixture = load_fixture("texas_dnq.json")
        result = step(fixture["state"], fixture["question_id"], fixture["answer_position"])
        assert result.is_terminal is True
        assert result.result_label == fixture["expected_result"]

    def test_texas_dnqy_terminal(self) -> None:
        fixture = load_fixture("texas_dnqy.json")
        result = step(fixture["state"], fixture["question_id"], fixture["answer_position"])
        assert result.is_terminal is True
        assert result.result_label == fixture["expected_result"]

    def test_texas_dwi_record_sealing_terminal(self) -> None:
        fixture = load_fixture("texas_dwi_record_sealing.json")
        result = step(fixture["state"], fixture["question_id"], fixture["answer_position"])
        assert result.is_terminal is True
        assert result.result_label == fixture["expected_result"]

    def test_non_terminal_step_returns_next_question(self) -> None:
        # question 0, answer 0: "I was arrested but not convicted" → next question
        result = step("texas", 0, 0)
        assert result.is_terminal is False
        assert result.next_question_id is not None
        assert result.next_question_text is not None

    def test_invalid_state_raises(self) -> None:
        with pytest.raises(FileNotFoundError):
            step("unknownstate", 0, 0)

    def test_invalid_transition_raises(self) -> None:
        with pytest.raises(ValueError, match="No transition found"):
            step("texas", 99, 99)

    def test_entry_question_returns_first_node(self) -> None:
        result = get_entry_question("texas")
        assert result.is_terminal is False
        assert result.next_question_id == 1
        assert result.next_question_text is not None
        assert len(result.next_answers) > 0

    def test_available_states_includes_texas(self) -> None:
        states = list_available_states()
        assert "texas" in states

    def test_tree_loader_caches(self) -> None:
        tree1 = load_tree("texas")
        tree2 = load_tree("texas")
        assert tree1 is tree2  # Same object (cached)

    def test_tree_has_expected_structure(self) -> None:
        tree = load_tree("texas")
        assert "nodes" in tree
        assert "transitions" in tree
        assert "results" in tree
        assert len(tree["nodes"]) > 0
        assert len(tree["transitions"]) > 0


class TestRuleEngineMultiStep:
    """Integration tests: multi-step paths through the tree."""

    def test_arrested_not_convicted_path_reaches_question(self) -> None:
        """question 0 answer 0 → should reach another question."""
        r0 = step("texas", 0, 0)
        assert not r0.is_terminal
        # Continue: question should be answerable
        assert r0.next_answers

    def test_federal_case_immediate_dnq(self) -> None:
        """Federal cases don't qualify — should terminate immediately."""
        result = step("texas", 0, 4)
        assert result.is_terminal
        assert "Does Not Qualify" in (result.result_label or "")

    def test_result_key_is_snake_case(self) -> None:
        result = step("texas", 1, 1)
        assert result.result_key is not None
        assert " " not in result.result_key
