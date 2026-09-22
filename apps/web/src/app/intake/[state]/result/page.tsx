import { formatStateName } from '@/app/LandingClient.utils';
import { CheckCircleIcon, XCircleIcon } from '@/components/icons/index';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ActionRow,
  Disclaimer,
  OutcomeBadge,
  PathSection,
  PathStep,
  PathSteps,
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
 * For Quick Form results, all data arrives via searchParams (no DB round-trip
 * needed). The Talk-to-Agent path (Phase 9) will fetch from the intakes API
 * using the intake_id param instead.
 */
export default async function ResultPage({ params, searchParams }: Props) {
  const { state } = await params;
  const sp = await searchParams;

  const stateName = formatStateName(state);
  const resultKey = sp.result_key ?? null;
  const resultLabel = sp.result_label ?? null;
  const path = sp.path ? sp.path.split(',') : [];
  const meta = getResultMeta(resultKey);

  const OutcomeIcon = meta.outcome === 'negative' ? XCircleIcon : CheckCircleIcon;
  const outcomeColor =
    meta.outcome === 'positive'
      ? 'var(--color-green-600)'
      : meta.outcome === 'negative'
        ? 'var(--color-red-600)'
        : 'var(--color-amber-600)';

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
          <PathSection>
            <SectionTitle>Decision path</SectionTitle>
            <PathSteps>
              {path.map((step) => (
                <PathStep key={step}>{step}</PathStep>
              ))}
            </PathSteps>
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
