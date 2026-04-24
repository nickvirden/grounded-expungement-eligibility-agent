'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { assessEligibility } from '@/lib/api';
import { sanitizeLegacyHtml } from '@/lib/sanitizeLegacyHtml';
import type { AssessResponse } from '@/lib/schemas';
import { ArrowRightIcon } from '@/components/icons/index';
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
  ProgressFill,
  ProgressTrack,
  QuestionText,
  StepCounter,
} from './QuickFormClient.styles';
import {
  computeProgress,
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

  const initialQuestionsLeft = entry.questions_left;

  const [questionId, setQuestionId] = useState(entry.question_id);
  const [questionText, setQuestionText] = useState(entry.question);
  const [questionHelp, setQuestionHelp] = useState<string | null>(entry.help);
  const [answers, setAnswers] = useState(entry.answers);
  const [questionsLeft, setQuestionsLeft] = useState(entry.questions_left);
  const [traversedPath, setTraversedPath] = useState<string[]>([]);
  const [stepNumber, setStepNumber] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);

  // Guard against double-submits
  const inFlight = useRef(false);

  const progress = useMemo(
    () => computeProgress(initialQuestionsLeft, questionsLeft),
    [initialQuestionsLeft, questionsLeft],
  );

  const stepsCompleted = initialQuestionsLeft - questionsLeft;

  const handleAnswer = useCallback(
    async (position: number) => {
      if (inFlight.current || isLoading) return;
      inFlight.current = true;
      setSelectedPosition(position);
      setIsLoading(true);
      setError(null);

      try {
        const result: AssessResponse = await assessEligibility({
          state,
          question_id: questionId,
          answer_position: position,
        });

        const newPath = [...traversedPath, stepToPathEntry(questionId, position)];
        setTraversedPath(newPath);

        if (result.is_terminal) {
          const params = new URLSearchParams({
            result_key: result.result_key ?? '',
            result_label: result.result_label ?? '',
            state,
            path: newPath.join(','),
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
        setSelectedPosition(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        setSelectedPosition(null);
      } finally {
        setIsLoading(false);
        inFlight.current = false;
      }
    },
    [isLoading, questionId, state, traversedPath, router],
  );

  const safeQuestionHtml = useMemo(
    () => sanitizeLegacyHtml(questionText),
    [questionText],
  );
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

        <StepCounter aria-live="polite">
          {stepsCompleted} / {initialQuestionsLeft}
        </StepCounter>
      </FormHeader>

      <ProgressTrack role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <ProgressFill $pct={progress} />
      </ProgressTrack>

      <FormBody>
        <FormCard aria-labelledby={headingId} key={`step-${stepNumber}`}>
          <QuestionText
            role="heading"
            aria-level={2}
            dangerouslySetInnerHTML={{ __html: safeQuestionHtml }}
          />

          {questionHelp && <HelpText dangerouslySetInnerHTML={{ __html: safeHelpHtml }} />}

          {isLoading ? (
            <LoadingRow aria-label="Loading next question">
              <LoadingDot />
              <LoadingDot />
              <LoadingDot />
            </LoadingRow>
          ) : (
            <AnswerList>
              {answers.map((answer) => (
                <AnswerListItem key={answer.position}>
                  <AnswerButton
                    onClick={() => void handleAnswer(answer.position)}
                    $selected={selectedPosition === answer.position}
                    $disabled={isLoading}
                    disabled={isLoading}
                    aria-pressed={selectedPosition === answer.position}
                  >
                    <span
                      dangerouslySetInnerHTML={{
                        __html: sanitizeLegacyHtml(answer.label ?? answer.value ?? ''),
                      }}
                    />
                    {selectedPosition === answer.position && (
                      <ArrowRightIcon size={16} color="var(--color-blue-600)" aria-hidden="true" />
                    )}
                  </AnswerButton>
                </AnswerListItem>
              ))}
            </AnswerList>
          )}

          {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

          {traversedPath.length > 0 && (
            <PathCrumb aria-label="Decision path so far">
              {traversedPath.join(' → ')}
            </PathCrumb>
          )}
        </FormCard>
      </FormBody>
    </PageShell>
  );
}
