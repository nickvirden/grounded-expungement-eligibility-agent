import { formatStateName } from '@/app/LandingClient.utils';
import DecisionPathList from '@/components/DecisionPathList';
import { CheckCircleIcon, XCircleIcon } from '@/components/icons/index';
import { getStateTree } from '@/lib/api';
import { decodeDecisionPath } from '@/lib/decisionPath';
import type { StateTree } from '@/lib/schemas';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ActionRow,
  Disclaimer,
  OutcomeBadge,
  PathSection,
  PrimaryButton,
  ResultBody,
  ResultCard,
  ResultHeadline,
  ResultShell,
  SecondaryButton,
  SectionTitle,
} from './page.styles';
import { getResultMeta } from './page.utils';

interface Props {
  params: Promise<{ state: string }>;
  searchParams: Promise<{ result_key?: string; result_label?: string; path?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { state } = await params;
  const sp = await searchParams;
  const stateName = formatStateName(state);
  return {
    title: `${stateName} Eligibility Result`,
    description: sp.result_label ?? `Your eligibility result for ${stateName}`,
  };
}

/**
 * Eligibility result page.
 *
 * This is the Quick Form's result screen -- all data arrives via searchParams
 * (no DB round-trip needed), since the stepper encodes the full traversed
 * path and result in the URL it navigates to. The Talk-to-Agent flow shows
 * its own result in the Case File panel instead (see ../talk/CaseFileCard.tsx),
 * which decodes the same kind of path through the same utility.
 *
 * The decision path itself is just a list of `questionId:answerPosition`
 * codes, so this page also fetches the state's decision tree to translate
 * those codes back into the actual question and answer text the user saw.
 */
export default async function ResultPage({ params, searchParams }: Props) {
  const { state } = await params;
  const sp = await searchParams;

  const stateName = formatStateName(state);
  const resultKey = sp.result_key ?? null;
  const resultLabel = sp.result_label ?? null;
  const path = sp.path ? sp.path.split(',') : [];
  const meta = getResultMeta(resultKey);

  // A direct-URL load (no stepper interaction first) must still render the
  // result -- fall back to raw-code rendering rather than hanging the whole
  // page (or 404ing) if the tree fetch fails or never responds.
  let tree: StateTree | null = null;
  try {
    tree = await getStateTree(state, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    tree = null;
  }
  const decodedPath = decodeDecisionPath(path, tree);

  const OutcomeIcon = meta.outcome === 'negative' ? XCircleIcon : CheckCircleIcon;
  const outcomeColor =
    meta.outcome === 'positive'
      ? 'var(--color-green-600)'
      : meta.outcome === 'negative'
        ? 'var(--color-red-600)'
        : 'var(--color-amber-800)';

  const outcomeLabel =
    meta.outcome === 'positive'
      ? 'Potentially eligible'
      : meta.outcome === 'negative'
        ? 'Does not qualify'
        : 'Conditional';

  return (
    <ResultShell>
      <ResultCard>
        <OutcomeBadge $outcome={meta.outcome}>
          <OutcomeIcon size={14} color={outcomeColor} aria-hidden="true" />
          {outcomeLabel}
        </OutcomeBadge>

        <ResultHeadline>{meta.headline}</ResultHeadline>
        <ResultBody>{meta.body}</ResultBody>

        {resultLabel && (
          <p>
            <strong>Result:</strong> {resultLabel} ({stateName})
          </p>
        )}

        {path.length > 0 && (
          <PathSection aria-labelledby="decision-path-heading">
            <SectionTitle id="decision-path-heading">Decision path</SectionTitle>
            <DecisionPathList steps={decodedPath} />
          </PathSection>
        )}

        <ActionRow>
          <PrimaryButton as={Link} href="/">
            Get started with ClearSlate
          </PrimaryButton>
          <SecondaryButton as={Link} href={`/intake/${state}/quick`}>
            Start over
          </SecondaryButton>
        </ActionRow>

        <Disclaimer>
          This tool provides general information only and is not legal advice. Results are
          preliminary and based on the answers provided. Always consult a licensed attorney for
          guidance specific to your situation.
        </Disclaimer>
      </ResultCard>
    </ResultShell>
  );
}
