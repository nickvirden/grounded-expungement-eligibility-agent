"""Structural integrity checks for every committed state decision tree.

Generic on purpose (not Texas-specific) -- these invariants must hold for any
state's extracted tree, not just the one currently exercised by the app.
"""
import filecmp
import json
from pathlib import Path
from typing import Any

import jsonschema
import pytest

from app.engine.tree_loader import list_available_states, load_tree

_SHARED_ROOT = Path(__file__).resolve().parents[3] / "packages" / "shared"
_SCHEMA_PATH = _SHARED_ROOT / "schemas" / "state-tree.schema.json"


@pytest.fixture(params=list_available_states())
def tree(request: pytest.FixtureRequest) -> tuple[str, dict[str, Any]]:
    state = request.param
    return state, load_tree(state)


def test_tree_validates_against_schema(tree: tuple[str, dict[str, Any]]) -> None:
    _state, data = tree
    with _SCHEMA_PATH.open() as f:
        schema = json.load(f)
    jsonschema.validate(instance=data, schema=schema)


def test_entry_node_exists(tree: tuple[str, dict[str, Any]]) -> None:
    state, data = tree
    assert data["entryNodeId"] in data["nodes"], f"{state}: missing entry node"


def test_node_keys_match_stored_group_variant(tree: tuple[str, dict[str, Any]]) -> None:
    state, data = tree
    for node_id, node in data["nodes"].items():
        assert node_id == f"{node['group']}-{node['variant']}", (
            f"{state}: node key {node_id!r} doesn't match stored group/variant"
        )


def test_transition_node_ids_resolve(tree: tuple[str, dict[str, Any]]) -> None:
    state, data = tree
    for t in data["transitions"]:
        if t["to"]["type"] == "question":
            assert t["to"]["nodeId"] in data["nodes"], (
                f"{state}: transition {t['from']} points at missing node {t['to']['nodeId']!r}"
            )


def test_from_pairs_are_unique(tree: tuple[str, dict[str, Any]]) -> None:
    state, data = tree
    seen = set()
    for t in data["transitions"]:
        key = (t["from"]["questionId"], t["from"]["answerPosition"])
        assert key not in seen, f"{state}: duplicate transition from {key}"
        seen.add(key)


def test_every_answer_has_a_transition(tree: tuple[str, dict[str, Any]]) -> None:
    state, data = tree
    from_keys = {
        (t["from"]["questionId"], t["from"]["answerPosition"]) for t in data["transitions"]
    }
    for node in data["nodes"].values():
        for answer in node["answers"]:
            key = (node["group"], answer["position"])
            node_id = f"{node['group']}-{node['variant']}"
            assert key in from_keys, f"{state}: {node_id} answer {answer} has no transition"


def test_no_orphaned_nodes(tree: tuple[str, dict[str, Any]]) -> None:
    """Every node except the entry node must be reachable via some transition."""
    state, data = tree
    referenced = {
        t["to"]["nodeId"] for t in data["transitions"] if t["to"]["type"] == "question"
    }
    referenced.add(data["entryNodeId"])
    for node_id in data["nodes"]:
        assert node_id in referenced, f"{state}: node {node_id!r} is never reached"


def _question_edges(data: dict[str, Any]) -> dict[str, list[str]]:
    """Node -> destination nodes, resolved the way the engine does: a transition is
    addressed by (group, answer position), not by the node the answer was shown on."""
    destinations = {
        (t["from"]["questionId"], t["from"]["answerPosition"]): t["to"]
        for t in data["transitions"]
    }
    edges: dict[str, list[str]] = {}
    for node_id, node in data["nodes"].items():
        edges[node_id] = [
            destinations[(node["group"], answer["position"])]["nodeId"]
            for answer in node["answers"]
            if destinations[(node["group"], answer["position"])]["type"] == "question"
        ]
    return edges


def test_every_node_is_reachable_from_the_entry_node(
    tree: tuple[str, dict[str, Any]],
) -> None:
    """Following answers from the entry node must reach every node; a node that only
    other unreachable nodes point at would pass a "is referenced" check but never
    be shown to a user."""
    state, data = tree
    edges = _question_edges(data)
    seen = {data["entryNodeId"]}
    frontier = [data["entryNodeId"]]
    while frontier:
        for destination in edges[frontier.pop()]:
            if destination not in seen:
                seen.add(destination)
                frontier.append(destination)
    assert not set(data["nodes"]) - seen, (
        f"{state}: unreachable from {data['entryNodeId']}: {sorted(set(data['nodes']) - seen)}"
    )


def test_no_answer_path_cycles_back_to_an_asked_question(
    tree: tuple[str, dict[str, Any]],
) -> None:
    """A cycle is a path with no exit: a user answering consistently is asked the same
    questions again indefinitely."""
    state, data = tree
    edges = _question_edges(data)
    in_progress: set[str] = set()
    finished: set[str] = set()

    for root in data["nodes"]:
        if root in finished:
            continue
        # Iterative depth-first search; each stack frame is (node, remaining destinations).
        path = [root]
        stack = [iter(edges[root])]
        in_progress.add(root)
        while stack:
            destination = next(stack[-1], None)
            if destination is None:
                finished.add(path[-1])
                in_progress.discard(path.pop())
                stack.pop()
            elif destination in in_progress:
                cycle = [*path[path.index(destination) :], destination]
                pytest.fail(f"{state}: answer path cycles: {' -> '.join(cycle)}")
            elif destination not in finished:
                in_progress.add(destination)
                path.append(destination)
                stack.append(iter(edges[destination]))


def test_answer_text_unique_within_a_question(tree: tuple[str, dict[str, Any]]) -> None:
    state, data = tree
    for node_id, node in data["nodes"].items():
        texts = [a["value"] for a in node["answers"]]
        assert len(texts) == len(set(texts)), f"{state}: {node_id} has duplicate answer text"


def test_result_values_are_known(tree: tuple[str, dict[str, Any]]) -> None:
    state, data = tree
    known_labels = set(data["results"].values())
    for t in data["transitions"]:
        if t["to"]["type"] == "result":
            assert t["to"]["value"] in known_labels, (
                f"{state}: unknown result label {t['to']['value']!r}"
            )


def test_shared_and_api_copies_are_identical() -> None:
    """apps/api/shared_data/ is the committed copy Vercel's build actually serves;
    it must never drift from packages/shared/ (see sync_shared_data.py).

    Only the state-trees/ and service-catalog.json that sync_shared_data.py
    actually copies are compared -- packages/shared/schemas/ is dev-time-only
    and intentionally isn't synced.
    """
    api_root = Path(__file__).resolve().parents[1]
    shared_src = api_root.parent.parent / "packages" / "shared"
    shared_dest = api_root / "shared_data"

    assert shared_src.exists(), f"expected {shared_src} to exist in a full monorepo checkout"
    assert shared_dest.exists(), f"expected {shared_dest} -- run sync_shared_data.py"

    cmp = filecmp.dircmp(shared_src / "state-trees", shared_dest / "state-trees")
    mismatch: list[str] = []
    errors: list[str] = []

    def _collect(d: "filecmp.dircmp[str]") -> None:
        mismatch.extend(str(Path(d.left) / f) for f in d.diff_files)
        errors.extend(str(Path(d.left) / f) for f in d.left_only)
        for sub in d.subdirs.values():
            _collect(sub)

    _collect(cmp)
    assert not mismatch, f"state-trees differ: {mismatch}"
    assert not errors, f"packages/shared/state-trees has files missing from shared_data: {errors}"

    catalog_src = shared_src / "service-catalog.json"
    catalog_dest = shared_dest / "service-catalog.json"
    assert filecmp.cmp(catalog_src, catalog_dest, shallow=False), "service-catalog.json differs"
