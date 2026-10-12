"""Interactive docs and the OpenAPI schema are served only when API_DOCS_ENABLED
is set. Run in a subprocess: `settings` and `app` are built once at import time,
so the flag can't be flipped within the process the rest of the suite shares.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent.parent

_PROBE_SCRIPT = (
    "import json\n"
    "from fastapi.testclient import TestClient\n"
    "from app.main import app\n"
    "client = TestClient(app, raise_server_exceptions=True)\n"
    "out = {}\n"
    "for path in ('/api/docs', '/api/redoc', '/api/openapi.json'):\n"
    "    resp = client.get(path)\n"
    "    out[path] = {\n"
    "        'status': resp.status_code,\n"
    "        'csp': resp.headers.get('content-security-policy'),\n"
    "        'body': resp.text if path == '/api/docs' else '',\n"
    "    }\n"
    "print(json.dumps(out))\n"
)

STRICT_CSP = "default-src 'none'; frame-ancestors 'none'"


def _probe(api_docs_enabled: str) -> dict[str, dict[str, object]]:
    env = dict(os.environ)
    env["API_DOCS_ENABLED"] = api_docs_enabled
    env["RATE_LIMIT_ENABLED"] = "false"
    # Fixed script literal, not external input -- same reasoning as
    # test_stream_token.py's subprocess call.
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-c", _PROBE_SCRIPT],
        cwd=API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    probed: dict[str, dict[str, object]] = json.loads(result.stdout.strip().splitlines()[-1])
    return probed


class TestDocsEnabled:
    def test_docs_pages_and_schema_are_served(self) -> None:
        probed = _probe("true")
        for path in ("/api/docs", "/api/redoc", "/api/openapi.json"):
            assert probed[path]["status"] == 200

    def test_swagger_ui_loads_the_schema_from_under_api(self) -> None:
        body = str(_probe("true")["/api/docs"]["body"])
        assert "/api/openapi.json" in body

    def test_schema_keeps_the_strict_csp(self) -> None:
        assert _probe("true")["/api/openapi.json"]["csp"] == STRICT_CSP

    def test_docs_pages_are_left_without_a_csp(self) -> None:
        probed = _probe("true")
        assert probed["/api/docs"]["csp"] is None
        assert probed["/api/redoc"]["csp"] is None


class TestDocsDisabled:
    def test_docs_pages_and_schema_are_not_found(self) -> None:
        probed = _probe("false")
        for path in ("/api/docs", "/api/redoc", "/api/openapi.json"):
            assert probed[path]["status"] == 404
