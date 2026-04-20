from fastapi import APIRouter, HTTPException

from app.engine import rule_engine
from app.schemas import EligibilityAssessRequest, EligibilityAssessResponse

router = APIRouter(prefix="/api/eligibility", tags=["eligibility"])


@router.post("/assess", response_model=EligibilityAssessResponse)
async def assess(req: EligibilityAssessRequest) -> EligibilityAssessResponse:
    """
    Advance one step in the deterministic eligibility decision tree.

    Accepts the current question_id and the selected answer_position,
    returns either the next question or a terminal eligibility result.
    """
    try:
        result = rule_engine.step(req.state, req.question_id, req.answer_position)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    services: list[dict] = []
    if result.is_terminal and result.result_label:
        service_keys = rule_engine.get_recommended_services(result.result_label)
        services = [{"key": k} for k in service_keys]

    return EligibilityAssessResponse(
        is_terminal=result.is_terminal,
        result_key=result.result_key,
        result_label=result.result_label,
        next_question_id=result.next_question_id,
        next_question_text=result.next_question_text,
        next_question_help=result.next_question_help,
        next_answers=result.next_answers or [],
        questions_left=result.questions_left,
        traversed_path=[f"{req.question_id}:{req.answer_position}"],
    )
