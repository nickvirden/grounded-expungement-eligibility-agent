"""Replay guard: a second stream attempt on the same intake must not start a
second, billable agent run.

TestReplayGuardOverHttp drives the real router end-to-end (testmodel, so the
stream completes synchronously within the test) and confirms exactly one
AgentRun row survives two attempts. TestClaimIntakeForRun exercises the
atomic UPDATE itself directly against SQLite; TestClaimIntakeForRunPostgres
repeats the same cases against real Postgres when one is reachable -- the
atomicity claim is specifically about concurrent-transaction behavior that
SQLite's single-writer model can mask (see test_health_readiness.py for the
same reachability-skip pattern used here).
"""
import os
import threading

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlmodel import Session, SQLModel, select

from app.agents.replay_guard import claim_intake_for_run
from app.db import engine
from app.main import app
from app.models import AgentRun, Intake
from app.security.csrf import CSRF_COOKIE, CSRF_HEADER, generate_csrf_token


def _csrf_client() -> tuple[TestClient, str]:
    token = generate_csrf_token()
    return TestClient(app, cookies={CSRF_COOKIE: token}, raise_server_exceptions=True), token


class TestReplayGuardOverHttp:
    def test_second_stream_attempt_returns_409_and_only_one_run_persists(self) -> None:
        c, token = _csrf_client()
        create_resp = c.post(
            "/api/intakes",
            headers={CSRF_HEADER: token},
            json={"mode": "agent", "state": "texas", "narrative_text": "dismissed in 2019"},
        )
        assert create_resp.status_code == 201
        intake_id = create_resp.json()["intake_id"]
        stream_token = create_resp.json()["stream_token"]
        auth_header = {"Authorization": f"Bearer {stream_token}"}

        first = c.get(f"/api/intakes/{intake_id}/stream", headers=auth_header)
        assert first.status_code == 200

        # The same token is still valid the second time (it's bound to the
        # intake and a TTL, not consumed on use) -- the replay guard, not
        # the token, is what stops the second attempt.
        second = c.get(f"/api/intakes/{intake_id}/stream", headers=auth_header)
        assert second.status_code == 409

        with Session(engine) as session:
            runs = session.exec(select(AgentRun).where(AgentRun.intake_id == intake_id)).all()
        assert len(runs) == 1


class TestClaimIntakeForRun:
    def _make_pending_intake(self, session: Session) -> str:
        intake = Intake(mode="agent", state="texas", status="pending")
        session.add(intake)
        session.commit()
        session.refresh(intake)
        return intake.id

    def test_claims_a_pending_intake(self) -> None:
        with Session(engine) as session:
            intake_id = self._make_pending_intake(session)
            assert claim_intake_for_run(session, intake_id) is True

            claimed = session.get(Intake, intake_id)
            assert claimed is not None
            assert claimed.status == "running"

    def test_second_claim_on_the_same_intake_fails(self) -> None:
        with Session(engine) as session:
            intake_id = self._make_pending_intake(session)
            assert claim_intake_for_run(session, intake_id) is True
            assert claim_intake_for_run(session, intake_id) is False

    def test_claim_on_a_nonexistent_intake_fails(self) -> None:
        with Session(engine) as session:
            assert claim_intake_for_run(session, "not-a-real-intake-id") is False

    def test_claim_on_an_already_completed_intake_fails(self) -> None:
        with Session(engine) as session:
            intake = Intake(mode="agent", state="texas", status="completed")
            session.add(intake)
            session.commit()
            session.refresh(intake)
            assert claim_intake_for_run(session, intake.id) is False


_POSTGRES_TEST_URL = os.environ.get(
    "READYZ_TEST_POSTGRES_URL", "postgresql+psycopg://postgres:readyztest@localhost:5557/readyztest"
)


def _postgres_engine() -> Engine:
    return create_engine(_POSTGRES_TEST_URL)


def _postgres_reachable() -> bool:
    try:
        with _postgres_engine().connect():
            return True
    except Exception:
        return False


@pytest.mark.skipif(
    not _postgres_reachable(),
    reason="No reachable Postgres test instance (set READYZ_TEST_POSTGRES_URL or run one on 5557)",
)
class TestClaimIntakeForRunPostgres:
    """Same claim behavior, against real Postgres.

    test_second_claim_on_the_same_intake_fails below runs its two claims
    sequentially in a single thread/connection -- on its own, that can't
    distinguish a genuinely atomic UPDATE from a naive check-then-act
    pattern that just happens to run in program order here.
    test_concurrent_claims_have_exactly_one_winner is what actually proves
    atomicity: many threads, each on its own connection, hit the same
    intake at once, and Postgres' READ COMMITTED isolation on a single
    conditional UPDATE guarantees exactly one of them wins, no matter how
    the attempts interleave.
    """

    def _make_pending_intake(self, pg_engine: Engine) -> str:
        with Session(pg_engine) as session:
            intake = Intake(mode="agent", state="texas", status="pending")
            session.add(intake)
            session.commit()
            session.refresh(intake)
            return intake.id

    def _delete_intake(self, pg_engine: Engine, intake_id: str) -> None:
        with Session(pg_engine) as session:
            claimed = session.get(Intake, intake_id)
            assert claimed is not None
            session.delete(claimed)  # leave a clean slate for the next run
            session.commit()

    def test_second_claim_on_the_same_intake_fails(self) -> None:
        pg_engine = _postgres_engine()
        SQLModel.metadata.create_all(pg_engine)
        intake_id = self._make_pending_intake(pg_engine)

        with Session(pg_engine) as session:
            assert claim_intake_for_run(session, intake_id) is True
            assert claim_intake_for_run(session, intake_id) is False

        self._delete_intake(pg_engine, intake_id)

    def test_concurrent_claims_have_exactly_one_winner(self) -> None:
        pg_engine = _postgres_engine()
        SQLModel.metadata.create_all(pg_engine)
        intake_id = self._make_pending_intake(pg_engine)

        thread_count = 32
        results: list[bool] = []
        results_lock = threading.Lock()
        start_barrier = threading.Barrier(thread_count)

        def _attempt_claim() -> None:
            # Every thread blocks here until all of them are ready, so the
            # UPDATE statements actually land concurrently rather than
            # trickling in one at a time.
            start_barrier.wait()
            with Session(pg_engine) as session:
                won = claim_intake_for_run(session, intake_id)
            with results_lock:
                results.append(won)

        threads = [threading.Thread(target=_attempt_claim) for _ in range(thread_count)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert results.count(True) == 1
        assert results.count(False) == thread_count - 1

        self._delete_intake(pg_engine, intake_id)
