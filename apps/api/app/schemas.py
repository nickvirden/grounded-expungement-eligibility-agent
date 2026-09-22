from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CaseFacts(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    state: str = Field(min_length=2, max_length=50)
    question_id: int = Field(ge=0)
    answer_position: int = Field(ge=0)


class EligibilityAssessRequest(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    state: str = Field(min_length=2, max_length=50)
    question_id: int = Field(ge=0)
    answer_position: int = Field(ge=0)


class TransitionTarget(BaseModel):
    type: str
    question_id: int | None = None
    question: str | None = None
    value: str | None = None


class EligibilityAssessResponse(BaseModel):
    is_terminal: bool
    result_key: str | None = None
    result_label: str | None = None
    next_question_id: int | None = None
    next_question_text: str | None = None
    next_question_help: str | None = None
    next_answers: list[dict[str, Any]] | None = None
    questions_left: int | None = None
    traversed_path: list[str] = Field(default_factory=list)


class ServiceRec(BaseModel):
    key: str
    name: str
    description: str
    base_price_usd: float


class EligibilityReport(BaseModel):
    intake_id: str
    state: str
    result_key: str
    result_label: str
    confidence: float = 1.0
    traversed_path: list[str] = Field(default_factory=list)
    recommended_services: list[ServiceRec] = Field(default_factory=list)


class StateInfo(BaseModel):
    state: str
    node_count: int
    transition_count: int
    result_keys: list[str]


class IntakeCreate(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    mode: str = Field(pattern="^(quick|agent)$")
    state: str = Field(min_length=2, max_length=50)
    narrative_text: str | None = Field(default=None, max_length=4000)


class HealthResponse(BaseModel):
    status: str
