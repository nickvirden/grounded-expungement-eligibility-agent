"""Rate limiting via slowapi (limits library wrapper for FastAPI/Starlette)."""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

# key_style="endpoint": slowapi's default ("url") keys each limit by the raw
# request path, so GET /api/intakes/{id}/stream counts each intake ID as a
# separate bucket -- a client can rotate IDs and never trip the limit despite
# every call triggering a billable agent run. Keying by the view function
# instead makes the counter shared across all IDs hitting the same route,
# while still keeping each decorated route (e.g. POST /api/intakes vs.
# GET .../stream) on its own independent budget.
limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.rate_limit_enabled,
    key_style="endpoint",
)

# Convenience decorators — imported and applied in routers
per_minute = f"{settings.rate_limit_per_minute}/minute"
intakes_per_minute = f"{settings.rate_limit_intakes_per_minute}/minute"
