"""Content-addressed versions for state decision trees.

A saved decision path is a list of `questionId:answerPosition` codes that is decoded against a
tree at display time. The version id names exactly the part of the tree that decoding reads, so
two trees share a version if and only if every saved path reads back identically from both.
"""
import hashlib
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.engine.tree_loader import _DEFAULT_TREES_DIR, load_tree

VERSION_RE = r"^[0-9a-f]{12}$"
_VERSION_PATTERN = re.compile(VERSION_RE)

SNAPSHOTS_DIRNAME = "snapshots"


def decode_projection(tree: dict[str, Any]) -> dict[str, Any]:
    """The slice of a tree that determines how a saved path decodes.

    Help text, node variants, remaining-question counts and extraction metadata are excluded:
    they never change which question or answer a code resolves to, so editing them must not
    invalidate previously stamped paths. Transitions stay in file order because the engine
    takes the first match.
    """
    return {
        "entryNodeId": tree["entryNodeId"],
        "nodes": {
            node_id: {
                "group": node["group"],
                "question": node["question"],
                "answers": [
                    {"value": a["value"], "position": a["position"]} for a in node["answers"]
                ],
            }
            for node_id, node in tree["nodes"].items()
        },
        "transitions": tree["transitions"],
    }


def _canonical(projection: dict[str, Any]) -> bytes:
    return json.dumps(
        projection, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def version_of(tree: dict[str, Any]) -> str:
    """First 12 hex characters of the SHA-256 of the tree's canonical decode projection."""
    return hashlib.sha256(_canonical(decode_projection(tree))).hexdigest()[:12]


@lru_cache(maxsize=32)
def tree_version(state: str, trees_dir: str = "") -> str:
    """Version of the cached tree for `state`; cached alongside `load_tree`."""
    return version_of(load_tree(state, trees_dir))


def snapshots_root(trees_dir: str = "") -> Path:
    return (Path(trees_dir) if trees_dir else _DEFAULT_TREES_DIR) / SNAPSHOTS_DIRNAME


def load_snapshot(state: str, version: str, trees_dir: str = "") -> dict[str, Any] | None:
    """Return the stored projection for (state, version), or None if there is none.

    Both arguments come from an unauthenticated request. Neither is ever joined into a path:
    each is matched against names that already exist on disk and the matching `Path` is used.
    """
    if not _VERSION_PATTERN.fullmatch(version):
        return None
    root = snapshots_root(trees_dir)
    if not root.is_dir():
        return None
    state_dir = next((p for p in root.iterdir() if p.is_dir() and p.name == state.lower()), None)
    if state_dir is None:
        return None
    snapshot = next((p for p in state_dir.glob("*.json") if p.stem == version), None)
    if snapshot is None:
        return None
    with snapshot.open(encoding="utf-8") as f:
        return json.load(f)  # type: ignore[no-any-return]
