"""Response-header security middleware and the unhandled-exception 500 handler.

The middleware sets: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
Permissions-Policy, COOP, CORP, a locked-down Content-Security-Policy (on app and
router responses, except any docs pages the app is configured to serve), removes
Server/X-Powered-By. `server_error_handler` builds the 500 for unhandled exceptions, which
Starlette answers outside this middleware, with the same headers.
"""
import structlog
from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import PlainTextResponse, Response
from starlette.types import ASGIApp

log = structlog.get_logger()

# The API returns only JSON/SSE, so nothing may load or frame. The Swagger UI and
# ReDoc pages load their JS/CSS from a CDN and inline-bootstrap themselves, so a
# strict policy would blank them; when served, they are the only exemption.
_API_CSP = "default-src 'none'; frame-ancestors 'none'"


def apply_security_headers(headers: MutableHeaders, *, with_csp: bool) -> None:
    """Set the security headers on ``headers`` and drop fingerprinting headers."""
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    headers["X-Content-Type-Options"] = "nosniff"
    headers["X-Frame-Options"] = "DENY"
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    headers["Cross-Origin-Opener-Policy"] = "same-origin"
    headers["Cross-Origin-Resource-Policy"] = "same-origin"
    if with_csp:
        headers["Content-Security-Policy"] = _API_CSP
    if "server" in headers:
        del headers["server"]
    if "x-powered-by" in headers:
        del headers["x-powered-by"]


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, *, csp_exempt_paths: frozenset[str] = frozenset()) -> None:
        super().__init__(app)
        self._csp_exempt_paths = csp_exempt_paths

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response: Response = await call_next(request)
        apply_security_headers(
            response.headers, with_csp=request.url.path not in self._csp_exempt_paths
        )
        return response


async def server_error_handler(request: Request, exc: Exception) -> Response:
    """Answer unhandled exceptions with a fixed 500 that carries the security headers.

    Starlette's ServerErrorMiddleware wraps all user middleware, so a 500 it produces
    bypasses SecurityHeadersMiddleware. The body is fixed. The event omits exc_info
    because structlog's ConsoleRenderer prints frame locals, which can hold user input
    that redact_pii (event-dict keys only) never sees. Starlette re-raises after sending,
    so the server's own traceback still reaches its log and does carry the exception
    message. Method and path come from the raw scope: request.url parses the Host header
    and raises on a malformed one, which would lose both the 500 and this event.
    """
    log.error(
        "unhandled_exception",
        method=request.scope["method"],
        path=request.scope["path"],
        exc_type=type(exc).__name__,
    )
    response = PlainTextResponse("Internal Server Error", status_code=500)
    apply_security_headers(response.headers, with_csp=True)
    return response
