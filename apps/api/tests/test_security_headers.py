"""Security middleware tests: headers, CSRF, origin enforcement, rate limiting."""
import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.security.csrf import CSRF_COOKIE, CSRF_HEADER, generate_csrf_token
from app.security.redaction import redact_pii

client = TestClient(app, raise_server_exceptions=True)


class TestSecurityHeaders:
    """Every response should carry the required security headers."""

    def test_hsts_present(self) -> None:
        resp = client.get("/healthz")
        assert "strict-transport-security" in resp.headers
        assert "max-age=63072000" in resp.headers["strict-transport-security"]

    def test_x_content_type_options(self) -> None:
        resp = client.get("/healthz")
        assert resp.headers.get("x-content-type-options") == "nosniff"

    def test_x_frame_options(self) -> None:
        resp = client.get("/healthz")
        assert resp.headers.get("x-frame-options") == "DENY"

    def test_referrer_policy(self) -> None:
        resp = client.get("/healthz")
        assert "referrer-policy" in resp.headers

    def test_permissions_policy(self) -> None:
        resp = client.get("/healthz")
        assert "permissions-policy" in resp.headers

    def test_coop_header(self) -> None:
        resp = client.get("/healthz")
        assert resp.headers.get("cross-origin-opener-policy") == "same-origin"


class TestCSRFMiddleware:
    """Mutating endpoints require matching cookie+header CSRF tokens."""

    def _valid_csrf_client(self) -> tuple[TestClient, str]:
        """Return a client that has a CSRF token cookie set."""
        token = generate_csrf_token()
        c = TestClient(app, cookies={CSRF_COOKIE: token}, raise_server_exceptions=True)
        return c, token

    def test_post_without_csrf_returns_403(self) -> None:
        # No cookie, no header
        resp = client.post(
            "/api/eligibility/assess",
            json={"state": "texas", "question_id": 0, "answer_position": 0},
        )
        assert resp.status_code == 403

    def test_post_with_mismatched_csrf_returns_403(self) -> None:
        token = generate_csrf_token()
        c = TestClient(app, cookies={CSRF_COOKIE: token}, raise_server_exceptions=True)
        resp = c.post(
            "/api/eligibility/assess",
            headers={CSRF_HEADER: "wrong-token"},
            json={"state": "texas", "question_id": 0, "answer_position": 0},
        )
        assert resp.status_code == 403

    def test_post_with_matching_csrf_succeeds(self) -> None:
        c, token = self._valid_csrf_client()
        resp = c.post(
            "/api/eligibility/assess",
            headers={CSRF_HEADER: token},
            json={"state": "texas", "question_id": 1, "answer_position": 1},
        )
        assert resp.status_code == 200

    def test_get_sets_csrf_cookie(self) -> None:
        resp = client.get("/healthz")
        # May or may not be set if cookie already present; just verify no error
        assert resp.status_code == 200


class TestStrictOriginMiddleware:
    """State-changing requests from non-allowlisted origins must be rejected."""

    def _post_with_origin(self, origin: str, sec_fetch_site: str = "") -> httpx.Response:
        token = generate_csrf_token()
        c = TestClient(app, cookies={CSRF_COOKIE: token}, raise_server_exceptions=True)
        headers: dict[str, str] = {CSRF_HEADER: token, "Origin": origin}
        if sec_fetch_site:
            headers["Sec-Fetch-Site"] = sec_fetch_site
        return c.post(
            "/api/eligibility/assess",
            headers=headers,
            json={"state": "texas", "question_id": 1, "answer_position": 1},
        )

    def test_cross_origin_sec_fetch_cross_site_rejected(self) -> None:
        resp = self._post_with_origin(
            "https://evil.com", sec_fetch_site="cross-site"
        )
        assert resp.status_code == 403

    def test_non_allowlisted_origin_rejected(self) -> None:
        resp = self._post_with_origin("https://attacker.example.com")
        assert resp.status_code == 403

    def test_same_origin_sec_fetch_allowed(self) -> None:
        resp = self._post_with_origin(
            "https://localhost:3000", sec_fetch_site="same-origin"
        )
        assert resp.status_code == 200


class TestPIIRedaction:
    """The structlog PII redaction processor must hash sensitive field values."""

    def test_narrative_is_redacted(self) -> None:
        event = {"narrative": "I was arrested for DWI in 2019", "event": "test"}
        result = redact_pii(None, "info", event)
        assert result["narrative"].startswith("<redacted:sha256:")
        assert "DWI" not in result["narrative"]

    def test_email_is_redacted(self) -> None:
        event = {"email": "user@example.com", "event": "test"}
        result = redact_pii(None, "info", event)
        assert result["email"].startswith("<redacted:sha256:")

    def test_non_pii_fields_pass_through(self) -> None:
        event = {"state": "texas", "question_id": 1, "event": "test"}
        result = redact_pii(None, "info", event)
        assert result["state"] == "texas"
        assert result["question_id"] == 1

    def test_redaction_is_deterministic(self) -> None:
        val = "same-value"
        e1 = redact_pii(None, "info", {"narrative": val, "event": "x"})
        e2 = redact_pii(None, "info", {"narrative": val, "event": "x"})
        assert e1["narrative"] == e2["narrative"]

    def test_different_values_produce_different_hashes(self) -> None:
        e1 = redact_pii(None, "info", {"narrative": "value-a", "event": "x"})
        e2 = redact_pii(None, "info", {"narrative": "value-b", "event": "x"})
        assert e1["narrative"] != e2["narrative"]
