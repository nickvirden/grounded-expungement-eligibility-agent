"""Strict-origin CORS enforcement + Sec-Fetch-Site check for state-changing requests."""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings

_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


class StrictOriginMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
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
            if origin and not any(
                origin.startswith(allowed) for allowed in settings.allowed_origins
            ):
                return JSONResponse(
                    {"detail": "Origin not allowed"},
                    status_code=403,
                )

        response: Response = await call_next(request)
        return response
