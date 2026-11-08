/**
 * Typed API client for the FastAPI backend.
 *
 * All requests go through this module so base URL resolution and response
 * validation are centralized.
 */
import { isTreeVersion } from './decisionPath';
import { internalApiUrl } from './internalApiUrl';
import {
  type AssessRequest,
  type AssessResponse,
  type IntakeCreate,
  type IntakeCreateResponse,
  type StateTree,
  assessResponseSchema,
  intakeCreateResponseSchema,
  stateTreeSchema,
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
const API_BASE = typeof window === 'undefined' ? internalApiUrl() : '/api/backend';

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }

  // The Fetch spec forbids a body on 204/205/304 responses -- res.json()
  // throws "Unexpected end of JSON input" on these even though the request
  // succeeded (e.g. DELETE /api/intakes/{id} returns 204 on success).
  if (res.status === 204 || res.status === 205 || res.status === 304) {
    return undefined as T;
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

/**
 * Fetch a state's decision tree. With `version`, the API returns the retained
 * snapshot for that version (404 when none exists). A value that is not a
 * well-formed version is dropped rather than sent, so it can never reach the
 * query string.
 */
export async function getStateTree(
  state: string,
  init?: RequestInit,
  version?: string,
): Promise<StateTree> {
  const query = version && isTreeVersion(version) ? `?version=${version}` : '';
  const data = await fetchJson<unknown>(`/api/states/${state}/tree${query}`, init);
  return stateTreeSchema.parse(data);
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

export async function deleteIntake(intakeId: string): Promise<void> {
  await fetchJson<void>(`/api/intakes/${intakeId}`, { method: 'DELETE' });
}
