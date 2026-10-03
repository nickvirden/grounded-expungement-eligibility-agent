'use client';

import { ArrowRightIcon } from '@/components/icons/index';
import { assessEligibility } from '@/lib/api';
import { sanitizeLegacyHtml } from '@/lib/sanitizeLegacyHtml';
import type { AssessResponse } from '@/lib/schemas';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  AnswerButton,
  AnswerList,
  AnswerListItem,
  BackButton,
  ErrorBanner,
  FormBody,
  FormCard,
  FormHeader,
  HeaderTitle,
  HelpText,
  LoadingDot,
  LoadingRow,
  PageShell,
  PathCrumb,
  PathCrumbItem,
  ProgressFill,
  ProgressTrack,
  QuestionText,
  StepCounter,
} from './QuickFormClient.styles';
import {
  computeProgress,
  describeProgress,
  responseToStep,
  stepToPathEntry,
} from './QuickFormClient.utils';

interface EntryQuestion {
  question_id: number;
  question: string;
  help: string | null;
  // API uses 'value'; AssessResponse (after Zod transform) uses 'label'
  answers: Array<{ value?: string; label?: string; position: number }>;
  questions_left: number;
}

interface Props {
  state: string;
  stateName: string;
  entry: EntryQuestion;
}

export default function QuickFormClient({ state, stateName, entry }: Props) {
  const router = useRouter();
  const headingId = useId();

  const [questionId, setQuestionId] = useState(entry.question_id);
  const [questionText, setQuestionText] = useState(entry.question);
  const [questionHelp, setQuestionHelp] = useState<string | null>(entry.help);
  const [answers, setAnswers] = useState(entry.answers);
  const [questionsLeft, setQuestionsLeft] = useState(entry.questions_left);
  // Single source of truth for the traversed path: the URL-encoded entry code
  // and the answer text shown in the breadcrumb are derived from the same
  // array, instead of being tracked in two parallel arrays that could drift.
  const [answeredSteps, setAnsweredSteps] = useState<Array<{ entry: string; answerLabel: string }>>(
    [],
  );
  const [stepNumber, setStepNumber] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Answer `position` is not a unique answer identifier within a question: the
  // legacy data model allows two distinct answers in the same question to
  // share a position value, so selection state and list keys are tracked by
  // array index instead (safe because FormCard remounts -- via its `key` --
  // on every question change).
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Guard against double-submits
  const inFlight = useRef(false);

  const answeredCount = answeredSteps.length;
  const progress = useMemo(
    () => computeProgress(answeredCount, questionsLeft),
    [answeredCount, questionsLeft],
  );
  const progressDescription = useMemo(
    () => describeProgress(answeredCount, questionsLeft),
    [answeredCount, questionsLeft],
  );

  const handleAnswer = useCallback(
    async (index: number, position: number, answerLabel: string) => {
      if (inFlight.current || isLoading) return;
      inFlight.current = true;
      setSelectedIndex(index);
      setIsLoading(true);
      setError(null);

      try {
        const result: AssessResponse = await assessEligibility({
          state,
          question_id: questionId,
          answer_position: position,
        });

        const newSteps = [
          ...answeredSteps,
          { entry: stepToPathEntry(questionId, position), answerLabel },
        ];
        setAnsweredSteps(newSteps);

        if (result.is_terminal) {
          const params = new URLSearchParams({
            result_key: result.result_key ?? '',
            result_label: result.result_label ?? '',
            state,
            path: newSteps.map((s) => s.entry).join(','),
          });
          router.push(`/intake/${state}/result?${params.toString()}`);
          return;
        }

        const next = responseToStep(result);
        setQuestionId(next.questionId);
        setQuestionText(next.questionText);
        setQuestionHelp(next.questionHelp);
        setAnswers(next.answers);
        setQuestionsLeft(next.questionsLeft);
        setStepNumber((s) => s + 1);
        setSelectedIndex(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        setSelectedIndex(null);
      } finally {
        setIsLoading(false);
        inFlight.current = false;
      }
    },
    [isLoading, questionId, state, answeredSteps, router],
  );

  const safeQuestionHtml = useMemo(() => sanitizeLegacyHtml(questionText), [questionText]);
  const safeHelpHtml = useMemo(
    () => (questionHelp ? sanitizeLegacyHtml(questionHelp) : ''),
    [questionHelp],
  );

  return (
    <PageShell>
      <FormHeader>
        <BackButton as={Link} href="/" aria-label="Back to home">
          ← Back
        </BackButton>

        <HeaderTitle id={headingId}>Eligibility Check — {stateName}</HeaderTitle>

        <StepCounter aria-live="polite">{progressDescription.summary}</StepCounter>
      </FormHeader>

      <ProgressTrack
        role="progressbar"
        aria-label="Eligibility check progress"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={progressDescription.valueText}
      >
        <ProgressFill $pct={progress} />
      </ProgressTrack>

      <FormBody>
        <FormCard aria-labelledby={headingId} key={`step-${stepNumber}`}>
          {/* Tree questions, help text and answers carry legacy inline markup (bold, lists,
              line breaks). Each string passes through sanitizeLegacyHtml, an attribute-free
              tag allowlist, before it reaches dangerouslySetInnerHTML. */}
          <QuestionText
            role="heading"
            aria-level={2}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by sanitizeLegacyHtml
            dangerouslySetInnerHTML={{ __html: safeQuestionHtml }}
          />

          {questionHelp && (
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by sanitizeLegacyHtml
            <HelpText dangerouslySetInnerHTML={{ __html: safeHelpHtml }} />
          )}

          {isLoading ? (
            <LoadingRow aria-label="Loading next question">
              <LoadingDot />
              <LoadingDot />
              <LoadingDot />
            </LoadingRow>
          ) : (
            <AnswerList>
              {/* answer.position isn't unique within a question (two answers can share a
                  position), and this list fully remounts on every question change via
                  FormCard's own step key above, so an index key is safe here. */}
              {answers.map((answer, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: see comment above
                <AnswerListItem key={index}>
                  <AnswerButton
                    onClick={() =>
                      void handleAnswer(index, answer.position, answer.label ?? answer.value ?? '')
                    }
                    $selected={selectedIndex === index}
                    $disabled={isLoading}
                    disabled={isLoading}
                    aria-pressed={selectedIndex === index}
                  >
                    <span
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by sanitizeLegacyHtml
                      dangerouslySetInnerHTML={{
                        __html: sanitizeLegacyHtml(answer.label ?? answer.value ?? ''),
                      }}
                    />
                    {selectedIndex === index && (
                      <ArrowRightIcon size={16} color="var(--color-blue-600)" aria-hidden="true" />
                    )}
                  </AnswerButton>
                </AnswerListItem>
              ))}
            </AnswerList>
          )}

          {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

          {answeredSteps.length > 0 && (
            <PathCrumb aria-label="Decision path so far">
              {/* Only the answer text is shown here, not the question -- the user just
                  read the question, so restating it would be redundant. */}
              {answeredSteps.map((step, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: steps are an immutable, ordered snapshot and an answer label can repeat, so the index is the only stable key available
                <PathCrumbItem key={index}>
                  <span
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by sanitizeLegacyHtml
                    dangerouslySetInnerHTML={{ __html: sanitizeLegacyHtml(step.answerLabel) }}
                  />
                </PathCrumbItem>
              ))}
            </PathCrumb>
          )}
        </FormCard>
      </FormBody>
    </PageShell>
  );
}
