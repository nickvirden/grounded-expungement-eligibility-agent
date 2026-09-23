"""Rate limiting tests: intake creation and its SSE stream are capped; everything else is not."""
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from slowapi.wrappers import LimitGroup

from app.main import app
from app.security.csrf import CSRF_COOKIE, CSRF_HEADER, generate_csrf_token
from app.security.rate_limit import limiter

client = TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def _enable_limiter() -> Generator[None]:
    """The suite runs with RATE_LIMIT_ENABLED=false (conftest.py) so the rest of
    the suite's rapid-fire POST /api/intakes calls don't trip the limit. This
    file exists to test the limiter itself, so it flips the shared `limiter`
    singleton on for each test and resets slowapi's in-memory counters
    afterward, so one test's hits never bleed into the next. The original
    `enabled` value is restored (not hardcoded to False) so this file doesn't
    leave the limiter disabled for tests that run after it if the suite is
    ever run with RATE_LIMIT_ENABLED=true.
    """
    original_enabled = limiter.enabled
    limiter.enabled = True
    limiter.reset()
    yield
    limiter.reset()
    limiter.enabled = original_enabled


def _csrf_client() -> tuple[TestClient, str]:
    token = generate_csrf_token()
    return TestClient(app, cookies={CSRF_COOKIE: token}), token


class TestIntakeCreationRateLimit:
    """POST /api/intakes is capped at rate_limit_intakes_per_minute (2/minute)."""

    def test_first_two_posts_within_a_minute_succeed(self) -> None:
        c, token = _csrf_client()
        for _ in range(2):
            resp = c.post(
                "/api/intakes",
                headers={CSRF_HEADER: token},
                json={"mode": "quick", "state": "texas"},
            )
            assert resp.status_code == 201

    def test_third_post_within_a_minute_is_rejected(self) -> None:
        c, token = _csrf_client()
        for _ in range(2):
            resp = c.post(
                "/api/intakes",
                headers={CSRF_HEADER: token},
                json={"mode": "quick", "state": "texas"},
            )
            assert resp.status_code == 201

        resp = c.post(
            "/api/intakes",
            headers={CSRF_HEADER: token},
            json={"mode": "quick", "state": "texas"},
        )
        assert resp.status_code == 429


class TestStreamRateLimit:
    """GET /api/intakes/{id}/stream has its own 2/minute budget, separate from
    POST /api/intakes -- the token check runs inside the route body (see
    intakes.py's docstring on stream_intake for why it can't be a
    `Depends(...)`), so a request with no/invalid token still counts toward
    the limit; the limit must trip on request volume alone, before auth
    even matters.
    """

    def test_repeated_stream_requests_are_rejected_regardless_of_auth(self) -> None:
        # No token, no session -- just hammering the endpoint. It should still trip.
        for _ in range(2):
            resp = client.get("/api/intakes/nonexistent-id/stream")
            # Under the limit: the token check runs before the intake lookup,
            # so a missing token always produces 401, real intake or not.
            assert resp.status_code == 401

        resp = client.get("/api/intakes/nonexistent-id/stream")
        assert resp.status_code == 429

    def test_different_intake_ids_share_the_same_stream_limit(self) -> None:
        # slowapi's default key includes the raw URL, so /stream/A and /stream/B
        # would be counted separately and a client could rotate IDs to dodge the
        # limit forever -- each successful stream triggers a billable agent run.
        # rate_limit.py's key_style="endpoint" keys this route by view function
        # instead, so distinct IDs still share one 2/minute bucket.
        for i in range(2):
            resp = client.get(f"/api/intakes/nonexistent-id-{i}/stream")
            assert resp.status_code == 401

        resp = client.get("/api/intakes/nonexistent-id-2/stream")
        assert resp.status_code == 429


class TestUnrelatedRoutesUnaffected:
    """The intake limit is scoped to its own routes; it must not leak onto others."""

    def test_states_route_is_not_capped_by_the_intake_limit(self) -> None:
        # rate_limit_intakes_per_minute is 2; hitting an unrelated, undecorated
        # route more than that many times in the same window confirms it isn't
        # subject to the intake routes' per-endpoint budget (key_style="endpoint"
        # scopes counters per view function, so /api/states never shares a
        # bucket with POST /api/intakes or GET .../stream regardless of path).
        for _ in range(5):
            resp = client.get("/api/states")
            assert resp.status_code == 200


class TestHealthProbesExempt:
    """/healthz and /readyz are @limiter.exempt so uptime probes never 429.

    Neither route carries its own @limiter.limit, so exempting them from
    nothing would prove nothing -- the fixture below gives them a strict
    global default limit to be exempted *from*, so removing @limiter.exempt
    would make these tests fail.
    """

    @pytest.fixture(autouse=True)
    def _strict_default_limit(self) -> Generator[None]:
        # slowapi has no public API to set this after construction.
        original_defaults = limiter._default_limits
        limiter._default_limits = [
            LimitGroup("1/minute", limiter._key_func, None, False, None, None, None, 1, False)
        ]
        yield
        limiter._default_limits = original_defaults

    def test_healthz_never_429s_under_load(self) -> None:
        for _ in range(20):
            resp = client.get("/healthz")
            assert resp.status_code == 200

    def test_readyz_never_429s_under_load(self) -> None:
        for _ in range(20):
            resp = client.get("/readyz")
            assert resp.status_code == 200

    def test_strict_default_limit_actually_applies_to_other_routes(self) -> None:
        # Positive control: proves the fixture's 1/minute default limit is real
        # (an unexempted route trips it), so the two tests above pass because of
        # the exemption -- not because the fixture failed to install a limit at all.
        resp = client.get("/api/states")
        assert resp.status_code == 200
        resp = client.get("/api/states")
        assert resp.status_code == 429
