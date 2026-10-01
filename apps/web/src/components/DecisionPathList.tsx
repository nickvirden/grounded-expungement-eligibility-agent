import type { DecisionPathStep } from '@/lib/decisionPath';
import { sanitizeLegacyHtml } from '@/lib/sanitizeLegacyHtml';
import {
  PathStep,
  PathStepAnswer,
  PathStepBody,
  PathStepQuestion,
  PathStepRaw,
  PathSteps,
} from './DecisionPathList.styles';

interface Props {
  steps: DecisionPathStep[];
  $density?: 'comfortable' | 'compact';
}

/**
 * Renders a decoded decision path as an ordered list of question/answer
 * pairs. Shared by the result page (SSR) and the Talk-to-Agent Case File
 * panel (client), so it carries no 'use client' directive.
 */
export default function DecisionPathList({ steps, $density = 'comfortable' }: Props) {
  return (
    <PathSteps>
      {steps.map((step, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: steps are an immutable, ordered snapshot and a raw entry can repeat, so the index is the only stable key available
        <PathStep key={index} $density={$density}>
          {step.kind === 'answered' ? (
            <PathStepBody>
              <PathStepQuestion
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by sanitizeLegacyHtml
                dangerouslySetInnerHTML={{ __html: sanitizeLegacyHtml(step.questionHtml) }}
              />
              <PathStepAnswer
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by sanitizeLegacyHtml
                dangerouslySetInnerHTML={{
                  __html: step.answerHtmls.map((html) => sanitizeLegacyHtml(html)).join(' or '),
                }}
              />
            </PathStepBody>
          ) : (
            <PathStepRaw>{step.raw}</PathStepRaw>
          )}
        </PathStep>
      ))}
    </PathSteps>
  );
}
