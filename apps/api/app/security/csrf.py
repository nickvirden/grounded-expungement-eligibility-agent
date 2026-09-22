"""Double-submit CSRF token middleware.

The frontend reads the CSRF cookie and echoes it back in the
X-CSRF-Token request header on every mutating request.

The middleware verifies the header matches the cookie value using
a constant-time comparison to prevent timing attacks.

In production (CSRF_SECURE=true, the default), the cookie uses the
`__Host-` prefix and `Secure` flag, which require HTTPS. For local
dev / E2E tests over plain HTTP, set CSRF_SECURE=false to use a plain
`csrf` cookie without the secure flag — the double-submit protection
still holds because the same-origin policy prevents cross-site reads.
"""
import hmac
import os
import secrets

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

_SECURE = os.getenv("CSRF_SECURE", "true").lower() not in ("0", "false", "no")

# __Host- prefix requires HTTPS + Secure flag + no Domain + Path=/
CSRF_COOKIE = "__Host-csrf" if _SECURE else "csrf"
CSRF_HEADER = "X-CSRF-Token"
_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
_SAFE_PATHS = {"/healthz", "/readyz"}


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path

        if request.method in _MUTATING and path not in _SAFE_PATHS:
            # Accept either the secure or insecure cookie name so the
            # middleware works regardless of whether CSRF_SECURE changed.
            cookie_token = request.cookies.get(CSRF_COOKIE, "") or request.cookies.get(
                "csrf" if _SECURE else "__Host-csrf", ""
            )
            header_token = request.headers.get(CSRF_HEADER, "")

            if not cookie_token or not header_token:
                return JSONResponse(
                    {"detail": "CSRF token missing"},
                    status_code=403,
                )

            if not hmac.compare_digest(cookie_token.encode(), header_token.encode()):
                return JSONResponse(
                    {"detail": "CSRF token mismatch"},
                    status_code=403,
                )

        response: Response = await call_next(request)

        # Issue a fresh CSRF cookie on every GET so the browser always has one.
        if request.method == "GET" and CSRF_COOKIE not in request.cookies:
            response.set_cookie(
                CSRF_COOKIE,
                generate_csrf_token(),
                secure=_SECURE,
                samesite="strict",
                httponly=False,  # Must be JS-readable for the double-submit pattern
                path="/",
            )

        return response
