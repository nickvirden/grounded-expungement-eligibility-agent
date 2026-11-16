import { formatStateName } from '@/app/LandingClient.utils';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QuickFormClient from './QuickFormClient';
import { loadEntry } from './loadEntry';

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

  const entry = await loadEntry(state);
  if (!entry) notFound();

  return <QuickFormClient state={state} stateName={stateName} entry={entry} />;
}
