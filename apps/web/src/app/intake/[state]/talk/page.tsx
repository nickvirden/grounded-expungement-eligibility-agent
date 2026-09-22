import { formatStateName } from '@/app/LandingClient.utils';
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

  return <TalkClient state={state} stateName={stateName} />;
}
