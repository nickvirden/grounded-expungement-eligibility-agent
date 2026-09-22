import datetime

import ulid
from sqlmodel import Field, Relationship, SQLModel


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


def _ulid_str() -> str:
    return str(ulid.new())


class Service(SQLModel, table=True):
    id: str = Field(default_factory=_ulid_str, primary_key=True)
    key: str = Field(index=True, unique=True)
    state: str = Field(index=True)
    name: str
    description: str
    base_price_usd: float


class Intake(SQLModel, table=True):
    id: str = Field(default_factory=_ulid_str, primary_key=True)
    created_at: datetime.datetime = Field(default_factory=_utcnow)
    mode: str = Field(description="'quick' or 'agent'")
    state: str
    narrative_text: str | None = None
    case_facts_json: str | None = None
    status: str = Field(default="pending")

    eligibility_results: list["EligibilityResult"] = Relationship(
        back_populates="intake",
        cascade_delete=True,
    )
    agent_runs: list["AgentRun"] = Relationship(
        back_populates="intake",
        cascade_delete=True,
    )


class EligibilityResult(SQLModel, table=True):
    id: str = Field(default_factory=_ulid_str, primary_key=True)
    intake_id: str = Field(foreign_key="intake.id", index=True)
    result_key: str
    recommended_service_keys: str = Field(default="[]")
    traversed_path_json: str = Field(default="[]")
    confidence: float = Field(default=1.0)
    computed_at: datetime.datetime = Field(default_factory=_utcnow)

    intake: Intake | None = Relationship(back_populates="eligibility_results")


class AgentRun(SQLModel, table=True):
    id: str = Field(default_factory=_ulid_str, primary_key=True)
    intake_id: str = Field(foreign_key="intake.id", index=True)
    provider: str = ""
    model: str = ""
    status: str = Field(default="running")
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    total_cost_usd: float = 0.0
    started_at: datetime.datetime = Field(default_factory=_utcnow)
    ended_at: datetime.datetime | None = None
    error: str | None = None

    intake: Intake | None = Relationship(back_populates="agent_runs")
    steps: list["AgentStep"] = Relationship(
        back_populates="run",
        cascade_delete=True,
    )


class AgentStep(SQLModel, table=True):
    id: str = Field(default_factory=_ulid_str, primary_key=True)
    run_id: str = Field(foreign_key="agentrun.id", index=True)
    step_idx: int
    type: str
    payload_json: str = "{}"
    latency_ms: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    created_at: datetime.datetime = Field(default_factory=_utcnow)

    run: AgentRun | None = Relationship(back_populates="steps")
