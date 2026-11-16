import { formatStateName } from '@/app/LandingClient.utils';
import { ApiError, type StateEntry, getStateEntry } from '@/lib/api';
import { isStateSlug } from '@/lib/stateSlug';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QuickFormClient from './QuickFormClient';

interface Props {
  params: Promise<{ state: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state } = await params;
  const stateName = formatStateName(state);
  return {
    title: `${stateName} Eligibility Check — Quick Form`,
    description: `Answer a few questions to find out if your record qualifies for relief in ${stateName}.`,
  };
}

/**
 * Deliberately only maps a 404 to `null` (unknown state): every other failure,
 * including an unreachable or hung API, propagates to the error boundary so an
 * outage is never reported as a missing page.
 */
async function fetchEntry(state: string): Promise<StateEntry | null> {
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

/**
 * Server Component: fetches the entry question so the first step is
 * included in the HTML payload (fast TTFB, no loading spinner on arrival).
 */
export default async function QuickFormPage({ params }: Props) {
  const { state } = await params;
  if (!isStateSlug(state)) notFound();
  const stateName = formatStateName(state);

  const entry = await fetchEntry(state);
  if (!entry) notFound();

  return <QuickFormClient state={state} stateName={stateName} entry={entry} />;
}
