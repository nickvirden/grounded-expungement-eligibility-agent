import type { Metadata } from 'next';
import LandingClient from './LandingClient';

export const metadata: Metadata = {
  title: 'Check Your Record Relief Eligibility',
  description:
    'Use our AI-powered tool to find out if your criminal record qualifies for expungement, sealing, or other relief.',
};

/**
 * Landing page (Server Component).
 *
 * Fetches the supported state list from the API so the state picker is
 * populated on the first byte (SSR). The interactive mode-chooser is
 * delegated to LandingClient.
 */
export default async function HomePage() {
  let states: string[] = [];

  try {
    const res = await fetch(
      `${process.env.INTERNAL_API_URL ?? 'http://localhost:8000'}/api/states`,
      { next: { revalidate: 3600 } },
    );
    if (res.ok) {
      // API returns list[StateInfo] — extract the state key from each object
      const data = (await res.json()) as Array<{ state: string }> | { states: string[] };
      states = Array.isArray(data) ? data.map((s) => s.state) : (data.states ?? []);
    }
  } catch {
    // Graceful degradation: fall back to static list on API unavailability.
    states = ['texas'];
  }

  return <LandingClient states={states} />;
}
