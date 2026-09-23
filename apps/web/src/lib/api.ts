/**
 * Typed API client for the FastAPI backend.
 *
 * All requests go through this module so base URL resolution and response
 * validation are centralized.
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

// Server-side (SSR, Route Handlers): call the API directly.
// Client-side (browser): route through /api/backend, a same-origin proxy
// (see apps/web/src/app/api/backend/[...path]/route.ts). The double-submit
// CSRF cookie pattern requires the cookie to be readable via document.cookie,
// which only works same-origin -- a cookie set by a cross-origin API
// response is invisible to JS running on a different origin's page, even
// though the browser stores and resends it automatically. The proxy
// sidesteps this: the browser only ever talks to its own origin, and the
// proxy synthesizes a matching CSRF pair server-to-server, same pattern as
// api/chat/route.ts already uses for the agent chat flow.
const API_BASE =
  typeof window === 'undefined'
    ? (process.env.INTERNAL_API_URL ?? 'http://api:8000')
    : '/api/backend';

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

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
