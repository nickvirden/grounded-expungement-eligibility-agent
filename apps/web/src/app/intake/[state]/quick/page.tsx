import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatStateName } from '@/app/LandingClient.utils';
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
 * Server Component: fetches the entry question so the first step is
 * included in the HTML payload (fast TTFB, no loading spinner on arrival).
 */
export default async function QuickFormPage({ params }: Props) {
  const { state } = await params;
  const stateName = formatStateName(state);
  const apiBase = process.env.INTERNAL_API_URL ?? 'http://localhost:8000';

  let entry: {
    question_id: number;
    question: string;
    help: string | null;
    answers: Array<{ label: string; position: number }>;
    questions_left: number;
  } | null = null;

  try {
    const res = await fetch(`${apiBase}/api/states/${state}/entry`, {
      next: { revalidate: 3600 },
    });

    if (res.status === 404) {
      notFound();
    }

    if (!res.ok) {
      throw new Error(`API error ${res.status}`);
    }

    entry = (await res.json()) as typeof entry;
  } catch {
    // If API is down during SSR, show a fallback (client will retry)
    entry = null;
  }

  if (!entry) {
    // API unreachable — render a server-side error state
    notFound();
  }

  return <QuickFormClient state={state} stateName={stateName} entry={entry} />;
}
