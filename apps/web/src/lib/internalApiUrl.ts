const DEFAULT_INTERNAL_API_URL = 'http://localhost:8000';

/**
 * Base URL the Next.js server uses to reach the FastAPI backend.
 *
 * Read per call rather than at import so route handlers and tests see the
 * current environment. An empty value counts as unset: a blank
 * `INTERNAL_API_URL=` line (common in copied .env files) would otherwise
 * produce relative upstream URLs that fail far from the misconfiguration.
 * Docker Compose, the Dockerfile, the Makefile and the e2e config all set the
 * variable explicitly, so the default only serves bare local development.
 *
 * Server-side only: the browser reaches the API through the same-origin
 * /api/backend proxy and never calls this.
 */
export function internalApiUrl(): string {
  return process.env.INTERNAL_API_URL || DEFAULT_INTERNAL_API_URL;
}
