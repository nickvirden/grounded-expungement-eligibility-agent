/**
 * Typed API client for the FastAPI backend.
 *
 * All requests go through this module so CSRF handling, base URL resolution,
 * and response validation are centralized.
 */
import {
  type AssessRequest,
  type AssessResponse,
  type EligibilityReport,
  type IntakeCreate,
  type IntakeCreateResponse,
  type StateInfo,
  assessResponseSchema,
  eligibilityReportSchema,
  intakeCreateResponseSchema,
  stateInfoSchema,
} from './schemas';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE =
  typeof window === 'undefined'
    ? (process.env.INTERNAL_API_URL ?? 'http://api:8000')
    : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000');

// ─── CSRF helpers ─────────────────────────────────────────────────────────────

/**
 * Read the CSRF token from the cookie set by the API on GET requests.
 *
 * Production uses __Host-csrf (requires HTTPS + Secure flag).
 * Local dev/test uses plain csrf (HTTP-compatible).
 * We check both so the client works regardless of environment.
 */
function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const secure = document.cookie.match(/(?:^|;\s*)__Host-csrf=([^;]+)/);
  if (secure) return secure[1]!;
  const dev = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/);
  return dev?.[1] ?? '';
}

/** Ensure a CSRF cookie is present, fetching one from the API if needed. */
async function ensureCsrfToken(): Promise<void> {
  if (getCsrfToken()) return;
  // Fire a GET /healthz to trigger the CSRF cookie; ignore the response body.
  await fetch(`${API_BASE}/healthz`, { credentials: 'include' });
}

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  const method = (options.method ?? 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    // Lazily bootstrap the CSRF cookie if the browser doesn't have one yet.
    // This happens on first mutation in a fresh browser session.
    await ensureCsrfToken();
    const token = getCsrfToken();
    if (token) headers.set('X-CSRF-Token', token);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include', // Required to send/receive cookies cross-origin
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API ${status}: ${body}`);
  }
}

// ─── States ───────────────────────────────────────────────────────────────────

export async function listStates(): Promise<string[]> {
  // API returns list[StateInfo] — extract just the state key
  const data = await fetchJson<Array<{ state: string }>>('/api/states');
  return data.map((s) => s.state);
}

export async function getStateInfo(state: string): Promise<StateInfo> {
  const data = await fetchJson<unknown>(`/api/states/${state}`);
  return stateInfoSchema.parse(data);
}

// ─── Eligibility ─────────────────────────────────────────────────────────────

export async function assessEligibility(body: AssessRequest): Promise<AssessResponse> {
  const data = await fetchJson<unknown>('/api/eligibility/assess', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return assessResponseSchema.parse(data);
}

// ─── Intakes ─────────────────────────────────────────────────────────────────

export async function createIntake(body: IntakeCreate): Promise<IntakeCreateResponse> {
  const data = await fetchJson<unknown>('/api/intakes', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return intakeCreateResponseSchema.parse(data);
}

export async function getIntake(intakeId: string): Promise<EligibilityReport> {
  const data = await fetchJson<unknown>(`/api/intakes/${intakeId}`);
  return eligibilityReportSchema.parse(data);
}

export async function deleteIntake(intakeId: string): Promise<void> {
  await fetchJson<void>(`/api/intakes/${intakeId}`, { method: 'DELETE' });
}

/**
 * Returns a ReadableStream of Server-Sent Events for a given intake.
 * Use the browser EventSource or parse the stream manually in a Route Handler.
 */
export function getIntakeStreamUrl(intakeId: string): string {
  return `${API_BASE}/api/intakes/${intakeId}/stream`;
}
