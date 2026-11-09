"""Tree version ids and the snapshot store behind them."""
import copy
import json
from pathlib import Path
from typing import Any

import pytest

from app.engine.tree_loader import list_available_states, load_tree
from app.engine.tree_version import (
    decode_projection,
    load_snapshot,
    snapshots_root,
    tree_version,
    version_of,
)

REMEDY = "run `make snapshot-trees`, then `cd apps/api && uv run python sync_shared_data.py`"


@pytest.fixture
def texas() -> dict[str, Any]:
    tree: dict[str, Any] = copy.deepcopy(load_tree("texas"))
    return tree


def _first_node(tree: dict[str, Any]) -> dict[str, Any]:
    node: dict[str, Any] = tree["nodes"][tree["entryNodeId"]]
    return node


class TestVersionIdentity:
    def test_is_twelve_lowercase_hex_characters(self, texas: dict[str, Any]) -> None:
        version = version_of(texas)
        assert len(version) == 12
        assert version == version.lower()
        int(version, 16)

    def test_help_edit_keeps_the_version(self, texas: dict[str, Any]) -> None:
        before = version_of(texas)
        _first_node(texas)["help"] = "<p>Reworded help.</p>"
        assert version_of(texas) == before

    def test_non_decoding_metadata_keeps_the_version(self, texas: dict[str, Any]) -> None:
        before = version_of(texas)
        texas["extractedAt"] = "2099-01-01T00:00:00Z"
        _first_node(texas)["variant"] = 99
        _first_node(texas)["questionsLeft"] = 99
        assert version_of(texas) == before

    def test_key_order_keeps_the_version(self, texas: dict[str, Any]) -> None:
        before = version_of(texas)
        reordered = {k: texas[k] for k in reversed(list(texas))}
        reordered["nodes"] = {
            node_id: dict(reversed(list(node.items())))
            for node_id, node in reversed(list(texas["nodes"].items()))
        }
        assert version_of(reordered) == before

    def test_question_text_changes_the_version(self, texas: dict[str, Any]) -> None:
        before = version_of(texas)
        _first_node(texas)["question"] += " (revised)"
        assert version_of(texas) != before

    def test_answer_text_changes_the_version(self, texas: dict[str, Any]) -> None:
        before = version_of(texas)
        _first_node(texas)["answers"][0]["value"] += " (revised)"
        assert version_of(texas) != before

    def test_answer_position_changes_the_version(self, texas: dict[str, Any]) -> None:
        before = version_of(texas)
        _first_node(texas)["answers"][0]["position"] += 100
        assert version_of(texas) != before

    def test_transition_order_changes_the_version(self, texas: dict[str, Any]) -> None:
        before = version_of(texas)
        texas["transitions"][0], texas["transitions"][1] = (
            texas["transitions"][1],
            texas["transitions"][0],
        )
        assert version_of(texas) != before

    def test_tree_version_matches_version_of_the_loaded_tree(self) -> None:
        assert tree_version("texas") == version_of(load_tree("texas"))


class TestSnapshotStore:
    @pytest.mark.parametrize("state", list_available_states())
    def test_current_version_has_a_matching_snapshot(self, state: str) -> None:
        tree = load_tree(state)
        version = tree_version(state)
        snapshot = load_snapshot(state, version)
        assert snapshot is not None, f"{state}@{version} has no snapshot: {REMEDY}"
        assert snapshot == decode_projection(tree), (
            f"{state}@{version} snapshot differs from the tree: {REMEDY}"
        )

    def test_every_snapshot_filename_is_the_hash_of_its_contents(self) -> None:
        files = sorted(snapshots_root().glob("*/*.json"))
        assert files, "no snapshots committed"
        for path in files:
            contents = json.loads(path.read_text(encoding="utf-8"))
            # A projection projects to itself, so the stored file hashes to its own name.
            assert version_of(contents) == path.stem, f"{path} is misnamed or edited"

    def test_earlier_wording_is_still_served_after_the_tree_changes(
        self, tmp_path: Path, texas: dict[str, Any]
    ) -> None:
        trees_dir = tmp_path / "state-trees"
        original_wording = _first_node(texas)["question"]
        v1 = version_of(texas)
        snapshot_path = trees_dir / "snapshots" / "texas" / f"{v1}.json"
        snapshot_path.parent.mkdir(parents=True)
        snapshot_path.write_text(json.dumps(decode_projection(texas)), encoding="utf-8")

        _first_node(texas)["question"] = "Entirely different wording?"
        (trees_dir / "texas.json").write_text(json.dumps(texas), encoding="utf-8")

        assert tree_version("texas", str(trees_dir)) != v1
        old = load_snapshot("texas", v1, str(trees_dir))
        assert old is not None
        assert old["nodes"][texas["entryNodeId"]]["question"] == original_wording

    @pytest.mark.parametrize(
        ("state", "version"),
        [
            ("texas", "ffffffffffff"),
            ("texas", "../texas"),
            ("texas", "ABCDEF123456"),
            ("..", "ffffffffffff"),
            ("nowhere", "ffffffffffff"),
        ],
    )
    def test_unknown_or_malformed_input_returns_none(self, state: str, version: str) -> None:
        assert load_snapshot(state, version) is None
