"""Double-submit CSRF token middleware.

The frontend reads the __Host-csrf cookie and echoes it back in the
X-CSRF-Token request header on every mutating request.

The middleware verifies the header matches the cookie value using
a constant-time comparison to prevent timing attacks.
"""
import hmac
import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

CSRF_COOKIE = "__Host-csrf"
CSRF_HEADER = "X-CSRF-Token"
_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
_SAFE_PATHS = {"/healthz", "/readyz"}


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        path = request.url.path

        if request.method in _MUTATING and path not in _SAFE_PATHS:
            cookie_token = request.cookies.get(CSRF_COOKIE, "")
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

        # Issue a fresh CSRF cookie on GET requests (browser will store it)
        if request.method == "GET" and CSRF_COOKIE not in request.cookies:
            response.set_cookie(
                CSRF_COOKIE,
                generate_csrf_token(),
                secure=True,
                samesite="strict",
                httponly=False,  # Must be readable by JS
                path="/",
            )

        return response
