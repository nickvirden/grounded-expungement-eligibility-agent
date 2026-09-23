"""Stream token auth: every failure mode of app/security/stream_token.py,
both as a pure module and as exercised through the real router, plus the
requirement that a missing SSE_SIGNING_KEY only takes down Talk-to-Agent,
never the rest of the API.

TestMintAndVerify and TestVerifyFailureModes exercise mint()/verify()
directly, against the real conftest.py-configured key. TestStreamEndpointAuth
drives POST /api/intakes and GET .../stream end-to-end for every one of
those same failure modes, confirming the router maps each to the documented
status code. TestMissingSigningKeyFailsClosedPerFeature proves the isolation
this depends on: a subprocess booted with no SSE_SIGNING_KEY at all still
serves /healthz and Quick Form normally, and only the agent-mode paths
return 503.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.security import stream_token
from app.security.csrf import CSRF_COOKIE, CSRF_HEADER, generate_csrf_token
from app.security.stream_token import (
    ExpiredTokenError,
    IntakeMismatchTokenError,
    InvalidTokenError,
    MissingTokenError,
    SigningKeyUnavailableError,
    verify,
)

API_ROOT = Path(__file__).resolve().parent.parent


def _csrf_client() -> tuple[TestClient, str]:
    token = generate_csrf_token()
    return TestClient(app, cookies={CSRF_COOKIE: token}, raise_server_exceptions=True), token


class TestMintAndVerify:
    def test_a_freshly_minted_token_verifies_for_its_own_intake(self) -> None:
        token = stream_token.mint("intake-123")
        verify(token, "intake-123")  # must not raise

    def test_mint_raises_when_the_signing_key_is_unconfigured(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(config.settings, "sse_signing_key", "")
        with pytest.raises(SigningKeyUnavailableError):
            stream_token.mint("intake-123")

    def test_is_configured_false_below_the_minimum_key_length(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(config.settings, "sse_signing_key", "too-short")
        assert stream_token.is_configured() is False


class TestVerifyFailureModes:
    def test_missing_token_raises_missing_token(self) -> None:
        with pytest.raises(MissingTokenError):
            verify(None, "intake-123")

    def test_empty_token_raises_missing_token(self) -> None:
        with pytest.raises(MissingTokenError):
            verify("", "intake-123")

    def test_malformed_token_raises_invalid_token(self) -> None:
        with pytest.raises(InvalidTokenError):
            verify("not-a-real-token", "intake-123")

    def test_tampered_token_raises_invalid_token(self) -> None:
        token = stream_token.mint("intake-123")
        with pytest.raises(InvalidTokenError):
            verify(token + "tampered", "intake-123")

    def test_expired_token_raises_expired_token(self, monkeypatch: pytest.MonkeyPatch) -> None:
        token = stream_token.mint("intake-123")
        # A negative TTL makes any token's age exceed it immediately,
        # without needing to mock the clock.
        monkeypatch.setattr(stream_token, "_TTL_SECONDS", -1)
        with pytest.raises(ExpiredTokenError):
            verify(token, "intake-123")

    def test_wrong_intake_token_raises_intake_mismatch(self) -> None:
        token = stream_token.mint("intake-123")
        with pytest.raises(IntakeMismatchTokenError):
            verify(token, "intake-456")

    def test_verify_raises_signing_key_unavailable_when_unconfigured(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        token = stream_token.mint("intake-123")
        monkeypatch.setattr(config.settings, "sse_signing_key", "")
        with pytest.raises(SigningKeyUnavailableError):
            verify(token, "intake-123")


class TestStreamEndpointAuth:
    """Drives the real router end-to-end (testmodel, so a valid token's
    stream completes synchronously) for every token failure mode.
    """

    def _create_agent_intake(self) -> tuple[TestClient, str, str]:
        client, csrf = _csrf_client()
        resp = client.post(
            "/api/intakes",
            headers={CSRF_HEADER: csrf},
            json={"mode": "agent", "state": "texas", "narrative_text": "dismissed in 2019"},
        )
        assert resp.status_code == 201
        body = resp.json()
        return client, body["intake_id"], body["stream_token"]

    def test_create_agent_intake_returns_a_stream_token(self) -> None:
        _client, intake_id, token = self._create_agent_intake()
        assert intake_id
        assert token

    def test_create_quick_intake_returns_no_stream_token(self) -> None:
        client, csrf = _csrf_client()
        resp = client.post(
            "/api/intakes",
            headers={CSRF_HEADER: csrf},
            json={"mode": "quick", "state": "texas"},
        )
        assert resp.status_code == 201
        assert resp.json()["stream_token"] is None

    def test_missing_token_returns_401_with_www_authenticate(self) -> None:
        client, intake_id, _token = self._create_agent_intake()
        resp = client.get(f"/api/intakes/{intake_id}/stream")
        assert resp.status_code == 401
        assert resp.headers["www-authenticate"] == "Bearer"

    def test_malformed_token_returns_401(self) -> None:
        client, intake_id, _token = self._create_agent_intake()
        resp = client.get(
            f"/api/intakes/{intake_id}/stream",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert resp.status_code == 401

    def test_non_bearer_scheme_is_treated_as_missing(self) -> None:
        client, intake_id, token = self._create_agent_intake()
        resp = client.get(
            f"/api/intakes/{intake_id}/stream",
            headers={"Authorization": f"Basic {token}"},
        )
        assert resp.status_code == 401

    def test_expired_token_returns_401(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client, intake_id, token = self._create_agent_intake()
        monkeypatch.setattr(stream_token, "_TTL_SECONDS", -1)
        resp = client.get(
            f"/api/intakes/{intake_id}/stream",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401

    def test_wrong_intake_token_returns_403(self) -> None:
        client, _intake_id, _token = self._create_agent_intake()
        _client2, other_intake_id, other_token = self._create_agent_intake()
        # other_token was minted for other_intake_id, not _intake_id -- using
        # it against a different intake must fail with 403, not 401, since
        # the signature and TTL are both genuinely fine.
        resp = client.get(
            f"/api/intakes/{_intake_id}/stream",
            headers={"Authorization": f"Bearer {other_token}"},
        )
        assert resp.status_code == 403
        assert other_intake_id != _intake_id

    def test_valid_token_returns_200(self) -> None:
        client, intake_id, token = self._create_agent_intake()
        resp = client.get(
            f"/api/intakes/{intake_id}/stream",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_invalid_token_never_reaches_the_intake_lookup(self) -> None:
        # A bad token against a real, existing intake and a bad token
        # against a made-up ID must behave identically (both 401) -- if the
        # router looked the intake up before checking the token, a real ID
        # would leak through as something other than a plain auth failure.
        client, real_intake_id, _token = self._create_agent_intake()
        real_resp = client.get(
            f"/api/intakes/{real_intake_id}/stream",
            headers={"Authorization": "Bearer garbage"},
        )
        fake_resp = client.get(
            "/api/intakes/definitely-not-a-real-intake-id/stream",
            headers={"Authorization": "Bearer garbage"},
        )
        assert real_resp.status_code == fake_resp.status_code == 401

    def test_a_rejected_token_does_not_consume_the_intakes_stream_claim(self) -> None:
        # The token check happens before the replay guard's atomic claim
        # (see intakes.py), so a request that never gets past auth must not
        # burn the intake's one-shot claim -- the real token still works
        # afterward, and only then does a second attempt correctly 409.
        client, intake_id, token = self._create_agent_intake()
        for _ in range(3):
            bad_resp = client.get(
                f"/api/intakes/{intake_id}/stream",
                headers={"Authorization": "Bearer garbage"},
            )
            assert bad_resp.status_code == 401

        first_real = client.get(
            f"/api/intakes/{intake_id}/stream",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert first_real.status_code == 200

        second_real = client.get(
            f"/api/intakes/{intake_id}/stream",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert second_real.status_code == 409


class TestMissingSigningKeyFailsClosedPerFeature:
    """A missing SSE_SIGNING_KEY must fail closed on Talk-to-Agent alone --
    not on API boot, not on any other route. Run in a subprocess: `settings`
    is a module-level singleton built once at import time, so this can't be
    exercised by monkeypatching within an already-imported process the rest
    of the suite shares.
    """

    def _boot_and_probe(self) -> dict[str, object]:
        script = (
            "import json\n"
            "from fastapi.testclient import TestClient\n"
            "from app.main import app\n"
            "from app.security.csrf import CSRF_COOKIE, CSRF_HEADER, generate_csrf_token\n"
            "csrf = generate_csrf_token()\n"
            "client = TestClient(app, cookies={CSRF_COOKIE: csrf}, raise_server_exceptions=True)\n"
            "healthz = client.get('/healthz').status_code\n"
            "quick = client.post('/api/intakes', headers={CSRF_HEADER: csrf}, "
            "json={'mode': 'quick', 'state': 'texas'}).status_code\n"
            "agent = client.post('/api/intakes', headers={CSRF_HEADER: csrf}, "
            "json={'mode': 'agent', 'state': 'texas'})\n"
            "stream = client.get('/api/intakes/whatever-id/stream').status_code\n"
            "print(json.dumps({'healthz': healthz, 'quick': quick, "
            "'agent': agent.status_code, 'stream': stream}))\n"
        )
        env = {k: v for k, v in os.environ.items() if k != "SSE_SIGNING_KEY"}
        env["RATE_LIMIT_ENABLED"] = "false"
        # _IMPORT_SCRIPT-style literal, not external input -- same reasoning
        # as test_startup_safety.py's subprocess call.
        result = subprocess.run(  # noqa: S603
            [sys.executable, "-c", script],
            cwd=API_ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        statuses: dict[str, object] = json.loads(result.stdout.strip().splitlines()[-1])
        return statuses

    def test_unrelated_routes_are_unaffected_and_only_agent_paths_503(self) -> None:
        statuses = self._boot_and_probe()
        assert statuses["healthz"] == 200
        assert statuses["quick"] == 201
        assert statuses["agent"] == 503
        assert statuses["stream"] == 503
