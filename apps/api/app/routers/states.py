from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Query

from app.engine.rule_engine import get_entry_question
from app.engine.tree_loader import list_available_states, load_tree
from app.engine.tree_version import VERSION_RE, load_snapshot, tree_version
from app.schemas import StateInfo

log = structlog.get_logger()

router = APIRouter(prefix="/api/states", tags=["states"])


@router.get("", response_model=list[StateInfo])
async def list_states() -> list[StateInfo]:
    """Return metadata for all available state decision trees."""
    states = list_available_states()
    result = []
    for s in states:
        try:
            tree = load_tree(s)
            result.append(
                StateInfo(
                    state=s,
                    node_count=len(tree.get("nodes", {})),
                    transition_count=len(tree.get("transitions", [])),
                    result_keys=list(tree.get("results", {}).keys()),
                )
            )
        except Exception as e:
            # One malformed tree should not take down the whole state list.
            log.warning("state_tree_unloadable", tree=s, error=str(e))
            continue
    return result


@router.get("/{state}/tree")
async def get_tree(
    state: str, version: str | None = Query(None, pattern=VERSION_RE)
) -> dict[str, Any]:
    """Return the decision tree JSON for a state (for the Quick Form stepper).

    With `version`, return the tree as worded at that version when it is still the current
    tree or a stored snapshot; `superseded` tells the client which. Responses are new dicts so
    the cached tree is never mutated.
    """
    try:
        tree = load_tree(state.lower())
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    current = tree_version(state.lower())
    if version is None or version == current:
        return {**tree, "treeVersion": current, "superseded": False}

    snapshot = load_snapshot(state, version)
    if snapshot is None:
        raise HTTPException(status_code=404, detail=f"No tree version '{version}' for '{state}'")
    return {**snapshot, "treeVersion": version, "superseded": True}


@router.get("/{state}/entry")
async def get_entry(state: str) -> dict[str, Any]:
    """Return the entry (first) question for a state."""
    try:
        result = get_entry_question(state.lower())
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    return {
        "question_id": result.next_question_id,
        "question": result.next_question_text,
        "help": result.next_question_help,
        "answers": result.next_answers,
        "questions_left": result.questions_left,
        "tree_version": tree_version(state.lower()),
    }
