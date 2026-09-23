"""Signed, short-lived tokens authorizing GET /api/intakes/{id}/stream.

Talk-to-Agent is the only feature gated by SSE_SIGNING_KEY: every other route
in this API works whether or not that key is configured, since failing the
whole process's boot over one optional feature's secret has a far bigger
blast radius than the feature itself (Quick Form, health checks, and every
other route have nothing to do with the agent stream). mint()/verify() are
also the two places that decide "is the signing key even usable" -- callers
check is_configured() (or catch SigningKeyUnavailableError) and turn that into a
503 "agent chat unavailable" response, not a crash.

mint(intake_id) binds a token to exactly one intake for a short window;
verify(token, intake_id) is the single place that checks a token's
signature, expiry, and intake binding, raising a distinct exception per
failure mode so callers (the stream route) can map each one to the right
HTTP status.
"""
from itsdangerous import BadData, SignatureExpired, URLSafeTimedSerializer

from app.config import settings

_SALT = "intake-stream"
_TTL_SECONDS = 120
# A key shorter than this is cheap to brute-force and provides no real
# protection against a forged token -- treated the same as "unset".
_MIN_KEY_LENGTH = 16


class StreamTokenError(Exception):
    """Base class for every way a stream token check can fail."""


class SigningKeyUnavailableError(StreamTokenError):
    """SSE_SIGNING_KEY is unset or too short to sign anything with."""


class MissingTokenError(StreamTokenError):
    """No bearer token was sent at all."""


class InvalidTokenError(StreamTokenError):
    """The token is malformed or its signature doesn't verify."""


class ExpiredTokenError(StreamTokenError):
    """The signature verifies, but the token's TTL has elapsed."""


class IntakeMismatchTokenError(StreamTokenError):
    """The token is valid, but was minted for a different intake."""


def is_configured() -> bool:
    return len(settings.sse_signing_key) >= _MIN_KEY_LENGTH


def _serializer() -> URLSafeTimedSerializer:
    if not is_configured():
        raise SigningKeyUnavailableError(
            "SSE_SIGNING_KEY is unset or too short -- Talk-to-Agent streaming is unavailable"
        )
    return URLSafeTimedSerializer(settings.sse_signing_key, salt=_SALT)


def mint(intake_id: str) -> str:
    """Sign a token binding the caller to this one intake ID.

    Raises SigningKeyUnavailableError if the signing key isn't configured --
    callers (POST /api/intakes) must check this before creating anything
    that depends on the token existing.
    """
    return _serializer().dumps(intake_id)


def verify(token: str | None, intake_id: str) -> None:
    """Raise a StreamTokenError subclass unless token is a live, unexpired,
    correctly-signed token minted for exactly this intake_id.

    Deliberately takes no DB session and does no lookup: this must be safe
    to call before the intake is fetched from the database, so an invalid
    token can't be used to probe which intake IDs exist.
    """
    # Checked before the token itself: a missing/too-short signing key must
    # surface as "this feature is unavailable" (503) regardless of whether a
    # token was even sent, not as a garden-variety "missing token" (401).
    serializer = _serializer()

    if not token:
        raise MissingTokenError("No bearer token provided")

    try:
        # max_age enforces the TTL; SignatureExpired is itself a BadData
        # subclass, so it must be caught ahead of the generic case below.
        token_intake_id = serializer.loads(token, max_age=_TTL_SECONDS)
    except SignatureExpired as e:
        raise ExpiredTokenError("Stream token has expired") from e
    except BadData as e:
        raise InvalidTokenError("Stream token is malformed or has an invalid signature") from e

    if token_intake_id != intake_id:
        raise IntakeMismatchTokenError("Stream token was not issued for this intake")
