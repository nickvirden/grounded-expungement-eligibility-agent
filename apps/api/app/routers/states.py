from fastapi import APIRouter, HTTPException

from app.engine.rule_engine import get_entry_question
from app.engine.tree_loader import list_available_states, load_tree
from app.schemas import StateInfo

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
        except Exception:  # noqa: BLE001
            continue
    return result


@router.get("/{state}/tree")
async def get_tree(state: str) -> dict:
    """Return the full decision tree JSON for a state (for the Quick Form stepper)."""
    try:
        return load_tree(state.lower())
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("/{state}/entry")
async def get_entry(state: str) -> dict:
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
    }
