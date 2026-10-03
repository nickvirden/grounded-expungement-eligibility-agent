"""Strict-origin CORS enforcement + Sec-Fetch-Site check for state-changing requests."""
from urllib.parse import urlsplit

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings

_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
_DEFAULT_PORTS = {"http": 80, "https": 443}


def _normalize_origin(value: str) -> tuple[str, str, int | None] | None:
    """Reduce an origin to (scheme, host, port), or None if it isn't a bare origin.

    Origins are compared as parsed tuples, never as string prefixes: a prefix
    check lets "https://app.example.com.evil.test" pass an allowlist entry of
    "https://app.example.com". Default ports are made explicit so an allowlist
    entry written with ":443" still matches the portless Origin browsers send.
    """
    try:
        parts = urlsplit(value.strip())
        port = parts.port
    except ValueError:
        return None
    if parts.scheme not in _DEFAULT_PORTS or not parts.hostname:
        return None
    if parts.path not in ("", "/") or parts.query or parts.fragment or parts.username:
        return None
    return (parts.scheme, parts.hostname, port or _DEFAULT_PORTS[parts.scheme])


def is_origin_allowed(origin: str, allowed_origins: list[str]) -> bool:
    candidate = _normalize_origin(origin)
    if candidate is None:
        return False
    return any(candidate == _normalize_origin(allowed) for allowed in allowed_origins)


class StrictOriginMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in _MUTATING:
            origin = request.headers.get("origin", "")
            sec_fetch_site = request.headers.get("sec-fetch-site", "")

            # Allow same-origin browser requests that set Sec-Fetch-Site
            if sec_fetch_site and sec_fetch_site not in ("same-origin", "same-site"):
                return JSONResponse(
                    {"detail": "Cross-origin requests not allowed"},
                    status_code=403,
                )

            # When Origin header is present, it must match the allowlist
            if origin and not is_origin_allowed(origin, settings.allowed_origins_list):
                return JSONResponse(
                    {"detail": "Origin not allowed"},
                    status_code=403,
                )

        response: Response = await call_next(request)
        return response
