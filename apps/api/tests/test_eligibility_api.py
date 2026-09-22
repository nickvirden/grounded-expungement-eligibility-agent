"""Integration tests for the eligibility API router."""
from fastapi.testclient import TestClient

from app.main import app
from app.security.csrf import CSRF_COOKIE, CSRF_HEADER, generate_csrf_token


def _csrf_client() -> tuple[TestClient, str]:
    """Return a TestClient with a pre-set CSRF cookie and the matching token."""
    token = generate_csrf_token()
    c = TestClient(app, cookies={CSRF_COOKIE: token}, raise_server_exceptions=True)
    return c, token


client = TestClient(app)


class TestHealthEndpoints:
    def test_healthz(self) -> None:
        resp = client.get("/healthz")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_readyz(self) -> None:
        resp = client.get("/readyz")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestStatesEndpoints:
    def test_list_states_includes_texas(self) -> None:
        resp = client.get("/api/states")
        assert resp.status_code == 200
        states = [s["state"] for s in resp.json()]
        assert "texas" in states

    def test_get_tree_texas(self) -> None:
        resp = client.get("/api/states/texas/tree")
        assert resp.status_code == 200
        data = resp.json()
        assert "nodes" in data
        assert "transitions" in data

    def test_get_tree_unknown_state(self) -> None:
        resp = client.get("/api/states/unknownstate/tree")
        assert resp.status_code == 404

    def test_get_entry_texas(self) -> None:
        resp = client.get("/api/states/texas/entry")
        assert resp.status_code == 200
        data = resp.json()
        assert data["question_id"] == 1
        assert data["question"] is not None
        assert len(data["answers"]) > 0


class TestEligibilityAssessEndpoints:
    def test_assess_terminal_expungement(self) -> None:
        c, token = _csrf_client()
        resp = c.post(
            "/api/eligibility/assess",
            headers={CSRF_HEADER: token},
            json={"state": "texas", "question_id": 1, "answer_position": 1},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_terminal"] is True
        assert data["result_label"] == "Texas Expungement"

    def test_assess_terminal_dnq(self) -> None:
        c, token = _csrf_client()
        resp = c.post(
            "/api/eligibility/assess",
            headers={CSRF_HEADER: token},
            json={"state": "texas", "question_id": 0, "answer_position": 4},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_terminal"] is True
        assert "Does Not Qualify" in data["result_label"]

    def test_assess_non_terminal_returns_question(self) -> None:
        c, token = _csrf_client()
        resp = c.post(
            "/api/eligibility/assess",
            headers={CSRF_HEADER: token},
            json={"state": "texas", "question_id": 0, "answer_position": 0},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_terminal"] is False
        assert data["next_question_id"] is not None
        assert data["next_question_text"] is not None

    def test_assess_unknown_state(self) -> None:
        c, token = _csrf_client()
        resp = c.post(
            "/api/eligibility/assess",
            headers={CSRF_HEADER: token},
            json={"state": "unknownstate", "question_id": 0, "answer_position": 0},
        )
        assert resp.status_code == 404

    def test_assess_invalid_transition(self) -> None:
        c, token = _csrf_client()
        resp = c.post(
            "/api/eligibility/assess",
            headers={CSRF_HEADER: token},
            json={"state": "texas", "question_id": 99, "answer_position": 99},
        )
        assert resp.status_code == 422

    def test_assess_returns_traversed_path(self) -> None:
        c, token = _csrf_client()
        resp = c.post(
            "/api/eligibility/assess",
            headers={CSRF_HEADER: token},
            json={"state": "texas", "question_id": 1, "answer_position": 1},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "traversed_path" in data
        assert len(data["traversed_path"]) > 0
