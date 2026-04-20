"""Rate limiting via slowapi (limits library wrapper for FastAPI/Starlette)."""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(key_func=get_remote_address)

# Convenience decorators — imported and applied in routers
per_minute = f"{settings.rate_limit_per_minute}/minute"
intakes_per_minute = f"{settings.rate_limit_intakes_per_minute}/minute"
