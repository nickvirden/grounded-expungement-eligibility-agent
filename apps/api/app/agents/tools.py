"""Typed agent tools.

Each tool has a Pydantic input/output schema. The critical invariant:
`assess_eligibility` is the ONLY path to an eligibility outcome.
The agent is prohibited by system prompt from stating a result without
calling this tool.
"""
import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.agents.guardrails import check_jurisdiction
from app.engine import rule_engine
from app.engine.tree_loader import load_service_catalog, load_tree


class ExtractCaseFactsInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    narrative: str = Field(max_length=4000)


class CaseFacts(BaseModel):
    state: str
    offense_description: str = ""
    disposition: str = ""
    year: int | None = None
    has_prior_convictions: bool | None = None
    raw_narrative: str = ""


class LookupStateTreeInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    state: str = Field(min_length=2, max_length=50)


class StateTreeMeta(BaseModel):
    state: str
    node_count: int
    result_keys: list[str]
    entry_question: str


class AssessEligibilityInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    state: str
    question_id: int = Field(ge=0)
    answer_position: int = Field(ge=0)


class EligibilityToolResult(BaseModel):
    is_terminal: bool
    result_key: str | None = None
    result_label: str | None = None
    next_question_id: int | None = None
    next_question_text: str | None = None
    next_answers: list[dict[str, Any]] = Field(default_factory=list)


class RecommendServicesInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    result_label: str


class ServiceRecommendation(BaseModel):
    key: str
    name: str
    description: str
    base_price_usd: float


class PersistIntakeInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    state: str
    mode: str = "agent"
    narrative_text: str | None = Field(default=None, max_length=4000)
    case_facts: CaseFacts | None = None
    result_label: str | None = None
    traversed_path: list[str] = Field(default_factory=list)


class IntakeId(BaseModel):
    intake_id: str


def tool_lookup_state_tree(state: str) -> StateTreeMeta:
    """Return metadata about a state decision tree."""
    check_jurisdiction(state)
    tree = load_tree(state.lower())
    entry = rule_engine.get_entry_question(state.lower())
    return StateTreeMeta(
        state=state,
        node_count=len(tree.get("nodes", {})),
        result_keys=list(tree.get("results", {}).values()),
        entry_question=entry.next_question_text or "",
    )


def tool_assess_eligibility(
    state: str, question_id: int, answer_position: int
) -> EligibilityToolResult:
    """Deterministically advance one step in the eligibility decision tree.

    This is the ONLY authoritative source of eligibility outcomes.
    The agent must call this tool for every step; it may never state
    an outcome based on its own reasoning.
    """
    check_jurisdiction(state)
    result = rule_engine.step(state.lower(), question_id, answer_position)
    return EligibilityToolResult(
        is_terminal=result.is_terminal,
        result_key=result.result_key,
        result_label=result.result_label,
        next_question_id=result.next_question_id,
        next_question_text=result.next_question_text,
        next_answers=result.next_answers or [],
    )


def tool_recommend_services(result_label: str) -> list[ServiceRecommendation]:
    """Return services matching an eligibility result label."""
    catalog = load_service_catalog()
    recs: list[ServiceRecommendation] = []
    for svc in catalog.get("services", []):
        if result_label in svc.get("eligibility_keys", []):
            recs.append(
                ServiceRecommendation(
                    key=svc["key"],
                    name=svc["name"],
                    description=svc["description"],
                    base_price_usd=svc["base_price_usd"],
                )
            )
    return recs
