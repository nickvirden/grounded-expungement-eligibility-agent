"""Response-header security middleware.

Sets: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
Permissions-Policy, COOP, CORP, a locked-down Content-Security-Policy (on app and
router responses, except any docs pages the app is configured
to serve), removes Server/X-Powered-By.
"""
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

# The API returns only JSON/SSE, so nothing may load or frame. The Swagger UI and
# ReDoc pages load their JS/CSS from a CDN and inline-bootstrap themselves, so a
# strict policy would blank them; when served, they are the only exemption.
_API_CSP = "default-src 'none'; frame-ancestors 'none'"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, *, csp_exempt_paths: frozenset[str] = frozenset()) -> None:
        super().__init__(app)
        self._csp_exempt_paths = csp_exempt_paths

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response: Response = await call_next(request)
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains; preload"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        if request.url.path not in self._csp_exempt_paths:
            response.headers["Content-Security-Policy"] = _API_CSP
        if "server" in response.headers:
            del response.headers["server"]
        if "x-powered-by" in response.headers:
            del response.headers["x-powered-by"]
        return response
