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

/** Read the CSRF token from the cookie set by the API on GET requests. */
function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)__Host-csrf=([^;]+)/);
  return match?.[1] ?? '';
}

async function fetchJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  const method = (options.method ?? 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = getCsrfToken();
    if (token) headers.set('X-CSRF-Token', token);
  }

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
  const data = await fetchJson<{ states: string[] }>('/api/states');
  return data.states;
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
