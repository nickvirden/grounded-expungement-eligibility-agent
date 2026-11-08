import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.agents.harness import _run_deterministic_demo
from app.db import engine
from app.engine.tree_version import tree_version
from app.main import app
from app.models import AgentRun, AgentStep
from app.security.csrf import CSRF_COOKIE, CSRF_HEADER, generate_csrf_token


@pytest.mark.parametrize(
    ("narrative", "expected_substring"),
    [
        ("My charges were dismissed in 2010 and nothing else happened.", "Texas"),
        # Pins this demo's deterministic answer-picking heuristic (it resolves
        # "convicted" to a felony DWI path), not a claim about what a real
        # felony conviction is actually eligible for.
        ("I was convicted of a felony in 2025.", "Pardon"),
        ("This was a juvenile matter in 2012.", ""),
    ],
)
def test_deterministic_demo_varies_outcomes(narrative: str, expected_substring: str) -> None:
    report, path = _run_deterministic_demo("texas", narrative)
    assert report.result_label
    assert len(path) > 0
    # Ensure traversal path is attached for UI transparency.
    assert report.traversed_path == path
    if expected_substring:
        assert expected_substring in report.result_label


def test_deterministic_demo_not_always_expungement() -> None:
    r1, _ = _run_deterministic_demo("texas", "My charges were dismissed in 2010.")
    r2, _ = _run_deterministic_demo("texas", "I was convicted of a felony in 2025.")
    assert r1.result_label != r2.result_label



def test_emitted_and_persisted_report_carry_the_tree_version() -> None:
    """Both the SSE `final` event and the stored AgentStep must name the tree the path was
    decoded against; the persisted copy is what a later view reads."""
    token = generate_csrf_token()
    c = TestClient(app, cookies={CSRF_COOKIE: token})
    created = c.post(
        "/api/intakes",
        headers={CSRF_HEADER: token},
        json={"mode": "agent", "state": "texas", "narrative_text": "dismissed in 2019"},
    )
    assert created.status_code == 201
    intake_id = created.json()["intake_id"]
    stream = c.get(
        f"/api/intakes/{intake_id}/stream",
        headers={"Authorization": f"Bearer {created.json()['stream_token']}"},
    )
    assert stream.status_code == 200

    expected = tree_version("texas")
    assert "tree_version" in stream.text
    assert expected in stream.text

    with Session(engine) as session:
        run = session.exec(select(AgentRun).where(AgentRun.intake_id == intake_id)).one()
        final = session.exec(
            select(AgentStep).where(AgentStep.run_id == run.id, AgentStep.type == "final")
        ).one()
    assert json.loads(final.payload_json)["tree_version"] == expected
