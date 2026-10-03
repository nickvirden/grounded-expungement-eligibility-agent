"""Origin parsing shared by the allowlist config and the origin check.

The allowlist is canonicalized once in Settings, so CORSMiddleware (which
compares strings exactly) and StrictOriginMiddleware (which compares parsed
origins) can never disagree about which origins are allowed.
"""
from urllib.parse import urlsplit

_DEFAULT_PORTS = {"http": 80, "https": 443}


def _parse_origin(value: str) -> tuple[str, str, int] | None:
    """Reduce a bare origin to (scheme, host, port), or None if it isn't one.

    Origins are compared as parsed tuples, never as string prefixes: a prefix
    check lets "https://app.example.com.evil.test" pass an allowlist entry of
    "https://app.example.com". Anything that isn't exactly scheme://host[:port]
    (userinfo, query, fragment, a path beyond "/", whitespace or control
    characters) is rejected rather than normalized away.
    """
    if any(ch.isspace() or ord(ch) < 32 for ch in value) or "?" in value or "#" in value:
        return None
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError:
        return None
    if parts.scheme not in _DEFAULT_PORTS or not parts.hostname:
        return None
    if parts.path not in ("", "/") or "@" in parts.netloc:
        return None
    return (parts.scheme, parts.hostname, _DEFAULT_PORTS[parts.scheme] if port is None else port)


def canonical_origin(value: str) -> str | None:
    """The form a browser sends in the Origin header, or None if not an origin.

    Lowercased, trailing slash dropped, default port omitted.
    """
    parsed = _parse_origin(value)
    if parsed is None:
        return None
    scheme, host, port = parsed
    host_part = f"[{host}]" if ":" in host else host
    return f"{scheme}://{host_part}" + ("" if port == _DEFAULT_PORTS[scheme] else f":{port}")


def is_origin_allowed(origin: str, allowed_origins: list[str]) -> bool:
    candidate = _parse_origin(origin)
    if candidate is None:
        return False
    return any(candidate == _parse_origin(allowed) for allowed in allowed_origins)
