"""structlog PII-redaction processor.

Walks every log record and replaces values for keys matching sensitive
patterns with a hashed placeholder. This runs as the FIRST processor
so no other formatter can leak PII.
"""
import hashlib
import re
from typing import Any

_PII_PATTERN = re.compile(
    r"narrative|case_facts|email|phone|name|dob|ssn|address|zip|ip_addr",
    re.IGNORECASE,
)


def redact_pii(logger: Any, method: str, event_dict: dict) -> dict:  # noqa: ARG001
    """structlog processor: redact PII fields before they reach any output."""
    for key in list(event_dict.keys()):
        if _PII_PATTERN.search(key):
            raw = str(event_dict[key])
            digest = hashlib.sha256(raw.encode()).hexdigest()[:8]
            event_dict[key] = f"<redacted:sha256:{digest}>"
    return event_dict
