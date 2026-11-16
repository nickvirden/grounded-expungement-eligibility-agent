import { ApiError, type StateEntry, getStateEntry } from '@/lib/api';

/**
 * Loads the quick form's entry question. `null` means the state does not exist:
 * either the slug is not state-shaped (getStateEntry rejects it before any request)
 * or the API answered 404. Every other failure, including an unreachable or hung API,
 * propagates to the error boundary so an outage is never reported as a missing page.
 */
export async function loadEntry(state: string): Promise<StateEntry | null> {
  try {
    return await getStateEntry(state, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
