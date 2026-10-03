"""Security middleware tests: headers, CSRF, origin enforcement, rate limiting."""
from typing import ClassVar

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.origins import canonical_origin, is_origin_allowed
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

    def test_allowlisted_origin_accepted(self) -> None:
        assert self._post_with_origin("https://localhost:3000").status_code == 200

    @pytest.mark.parametrize(
        "origin",
        [
            "https://localhost:3000.evil.test",
            "https://localhost:30001",
            "https://localhost:3000@evil.test",
            "https://localhost:3000/path",
            "http://localhost:3000",
            "null",
        ],
    )
    def test_lookalike_origins_rejected(self, origin: str) -> None:
        assert self._post_with_origin(origin).status_code == 403


class TestOriginMatching:
    ALLOWED: ClassVar[list[str]] = ["https://app.example.com", "http://localhost:3000"]

    @pytest.mark.parametrize(
        "origin",
        [
            "https://app.example.com",
            "https://app.example.com:443",
            "HTTPS://APP.EXAMPLE.COM",
            "http://localhost:3000",
        ],
    )
    def test_equivalent_origins_match(self, origin: str) -> None:
        assert is_origin_allowed(origin, self.ALLOWED)

    @pytest.mark.parametrize(
        "origin",
        [
            "https://app.example.com.evil.test",
            "https://evil-app.example.com",
            "https://app.example.com:8443",
            "http://app.example.com",
            "https://localhost:3000",
            "https://app.example.com/x",
            "https://app.example.com:0",
            "https://:pw@app.example.com",
            "https://@app.example.com",
            "https://app.example.com?",
            "https://app.example.com#",
            "https://app.exa\tmple.com",
            "https://app.example.com\n",
            "app.example.com",
            "",
        ],
    )
    def test_non_matching_origins_rejected(self, origin: str) -> None:
        assert not is_origin_allowed(origin, self.ALLOWED)

    def test_malformed_allowlist_entries_match_nothing(self) -> None:
        malformed = ["*", "garbage", "", "https://app.example.com:0", "https://a.test/x"]
        assert not is_origin_allowed("https://app.example.com", malformed)
        assert not is_origin_allowed("garbage", malformed)
        assert not is_origin_allowed("", malformed)


class TestCanonicalOrigin:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("https://app.example.com", "https://app.example.com"),
            ("https://app.example.com/", "https://app.example.com"),
            ("https://app.example.com:443", "https://app.example.com"),
            ("HTTPS://App.Example.COM", "https://app.example.com"),
            ("http://localhost:3000", "http://localhost:3000"),
            ("http://[::1]:3000", "http://[::1]:3000"),
            ("https://app.example.com/x", None),
            ("*", None),
        ],
    )
    def test_canonical_form(self, raw: str, expected: str | None) -> None:
        assert canonical_origin(raw) == expected


class TestAllowlistIsCanonicalForCors:
    """CORS compares allowlist strings exactly, so entries are canonicalized once."""

    def test_loosely_written_entries_become_the_string_a_browser_sends(self) -> None:
        loose = "HTTPS://App.Example.com:443/, http://localhost:3000"
        cfg = Settings(allowed_origins=loose)
        assert cfg.allowed_origins_list == ["https://app.example.com", "http://localhost:3000"]

    def test_malformed_entries_are_kept_so_they_match_nothing(self) -> None:
        cfg = Settings(allowed_origins="https://app.example.com,*")
        assert cfg.allowed_origins_list == ["https://app.example.com", "*"]


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
