import { formatStateName } from '@/app/LandingClient.utils';
import { getStateTree } from '@/lib/api';
import type { StateTree } from '@/lib/schemas';
import type { Metadata } from 'next';
import TalkClient from './TalkClient';

interface Props {
  params: Promise<{ state: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state } = await params;
  const stateName = formatStateName(state);
  return {
    title: `${stateName} — Talk to Eligibility Agent`,
    description: `Describe your situation to our AI agent and find out if your record qualifies for relief in ${stateName}.`,
  };
}

/**
 * Talk-to-Agent page (Server Component shell).
 *
 * The actual chat UI is client-side only (streaming, event-driven state),
 * so this page is a thin SSR shell that passes the state name and delegates
 * everything to TalkClient.
 */
export default async function TalkPage({ params }: Props) {
  const { state } = await params;
  const stateName = formatStateName(state);

  // Powers decision-path decoding in the Case File panel once a report
  // arrives. Fetch failures (including a timeout) fall back to null rather
  // than hanging or failing the page -- the panel then renders raw path
  // codes instead of decoded question text.
  let decisionTree: StateTree | null = null;
  try {
    decisionTree = await getStateTree(state, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    decisionTree = null;
  }

  return <TalkClient state={state} stateName={stateName} decisionTree={decisionTree} />;
}
