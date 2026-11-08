import { formatStateName } from '@/app/LandingClient.utils';
import { internalApiUrl } from '@/lib/internalApiUrl';
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

interface Entry {
  question_id: number;
  question: string;
  help: string | null;
  // API (and Texas JSON tree) uses 'value'; normalized to 'label' by Zod on client
  answers: Array<{ value?: string; label?: string; position: number }>;
  questions_left: number;
}

/**
 * Deliberately has no try/catch: a 404 maps to `null` (unknown state), while
 * every other failure, including an unreachable API, propagates to the error
 * boundary so an outage is never reported as a missing page.
 */
async function fetchEntry(state: string): Promise<Entry | null> {
  const res = await fetch(`${internalApiUrl()}/api/states/${state}/entry`, {
    next: { revalidate: 3600 },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Entry request failed: ${res.status}`);

  return (await res.json()) as Entry;
}

/**
 * Server Component: fetches the entry question so the first step is
 * included in the HTML payload (fast TTFB, no loading spinner on arrival).
 */
export default async function QuickFormPage({ params }: Props) {
  const { state } = await params;
  const stateName = formatStateName(state);

  const entry = await fetchEntry(state);
  if (!entry) notFound();

  return <QuickFormClient state={state} stateName={stateName} entry={entry} />;
}
