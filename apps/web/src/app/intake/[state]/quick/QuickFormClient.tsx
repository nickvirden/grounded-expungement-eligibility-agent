'use client';

import { HelpSection } from '@/components/HelpDialog';
import { ArrowRightIcon } from '@/components/icons/index';
import { assessEligibility } from '@/lib/api';
import { sanitizeLegacyHtml } from '@/lib/sanitizeLegacyHtml';
import type { AssessResponse } from '@/lib/schemas';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AnswerButton,
  AnswerList,
  AnswerListItem,
  BackButton,
  ErrorBanner,
  ExitActions,
  ExitPanel,
  ExitPrimaryAction,
  ExitSecondaryAction,
  ExitText,
  ExitTitle,
  FormBody,
  FormCard,
  FormHeader,
  HeaderTitle,
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
  isRepeatedQuestion,
  questionKey,
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

// Remounting the stepper under a new key discards every piece of local state at once, so
// "Start over" cannot leave a stale path, question or error behind.
export default function QuickFormClient(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return (
    <QuickFormStepper
      key={attempt}
      {...props}
      restarted={attempt > 0}
      onRestart={() => setAttempt((n) => n + 1)}
    />
  );
}

// Focus moves only when nothing else holds it. A user who tabbed to the skip link or Back link
// while a response was pending keeps their place; an answer button that unmounted leaves focus
// on the body.
function focusIsFree(card: HTMLElement | null): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !!card?.contains(active);
}

interface StepperProps extends Props {
  restarted: boolean;
  onRestart: () => void;
}

function QuickFormStepper({ state, stateName, entry, restarted, onRestart }: StepperProps) {
  const router = useRouter();
  const headingId = useId();
  const exitHeadingId = useId();
  const errorId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const exitHeadingRef = useRef<HTMLHeadingElement>(null);
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);

  const [questionId, setQuestionId] = useState(entry.question_id);
  const [questionText, setQuestionText] = useState(entry.question);
  const [questionHelp, setQuestionHelp] = useState<string | null>(entry.help);
  const [answers, setAnswers] = useState(entry.answers);
  const [questionsLeft, setQuestionsLeft] = useState(entry.questions_left);
  // Single source of truth for the traversed path: the URL-encoded entry code
  // and the answer text shown in the breadcrumb are derived from the same
  // array, instead of being tracked in two parallel arrays that could drift.
  const [answeredSteps, setAnsweredSteps] = useState<
    Array<{ entry: string; answerLabel: string; questionKey: string }>
  >([]);
  // Set when the engine returns a question already answered on this path. The engine keeps no
  // memory of the path, so continuing would revisit steps the user already took.
  const [loopExit, setLoopExit] = useState(false);
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
          {
            entry: stepToPathEntry(questionId, position),
            answerLabel,
            questionKey: questionKey({ questionId, questionText, answers }),
          },
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
        if (
          isRepeatedQuestion(
            newSteps.map((s) => s.questionKey),
            questionKey(next),
          )
        ) {
          setLoopExit(true);
          return;
        }
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
    [isLoading, questionId, questionText, answers, state, answeredSteps, router],
  );

  // Focus would otherwise be left on an answer button that has just been removed.
  useEffect(() => {
    if (loopExit) exitHeadingRef.current?.focus();
  }, [loopExit]);

  // After "Start over" the control that held focus is gone; the first question takes it.
  useEffect(() => {
    if (restarted) questionHeadingRef.current?.focus();
  }, [restarted]);

  // The answer that held focus unmounts when the next question replaces the card. Loop-exit and
  // terminal answers return before the step advances, so the exit heading keeps its focus.
  useEffect(() => {
    if (stepNumber > 0 && focusIsFree(cardRef.current)) questionHeadingRef.current?.focus();
  }, [stepNumber]);

  // A failed answer also unmounts the answer list while it loads, so focus returns to the
  // question. The heading is described by the error banner, so focusing it reads the error too.
  useEffect(() => {
    if (error && focusIsFree(cardRef.current)) questionHeadingRef.current?.focus();
  }, [error]);

  const safeQuestionHtml = useMemo(() => sanitizeLegacyHtml(questionText), [questionText]);

  return (
    <PageShell>
      <FormHeader>
        <BackButton as={Link} href="/" aria-label="Back to home">
          ← Back
        </BackButton>

        <HeaderTitle id={headingId}>Eligibility Check — {stateName}</HeaderTitle>

        <StepCounter aria-live="polite">
          {loopExit ? `${answeredCount} answered` : progressDescription.summary}
        </StepCounter>
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
        <FormCard ref={cardRef} aria-labelledby={headingId} key={`step-${stepNumber}`}>
          {loopExit ? (
            <ExitPanel aria-labelledby={exitHeadingId}>
              <ExitTitle id={exitHeadingId} ref={exitHeadingRef} tabIndex={-1}>
                We can't finish this check
              </ExitTitle>
              <ExitText>
                Your answers led back to a question you already answered, so this form can't reach a
                result. That's a problem with our questions, not your answers.
              </ExitText>
              <ExitActions>
                <ExitPrimaryAction type="button" onClick={onRestart}>
                  Start over
                </ExitPrimaryAction>
                <ExitSecondaryAction as={Link} href={`/intake/${state}/talk`}>
                  Talk to the agent instead
                </ExitSecondaryAction>
              </ExitActions>
            </ExitPanel>
          ) : (
            <>
              {/* Tree questions and answers carry legacy inline markup (bold, lists, line breaks).
                  Each string passes through sanitizeLegacyHtml, an attribute-free tag allowlist,
                  before it reaches dangerouslySetInnerHTML. Help text has its own transform and
                  sanitizer profile (see HelpDialog). */}
              <QuestionText
                ref={questionHeadingRef}
                tabIndex={-1}
                role="heading"
                aria-level={2}
                aria-describedby={error ? errorId : undefined}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by sanitizeLegacyHtml
                dangerouslySetInnerHTML={{ __html: safeQuestionHtml }}
              />

              <HelpSection
                state={state}
                question={questionText}
                help={questionHelp}
                answers={answers}
                disabled={isLoading}
              />

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
                          void handleAnswer(
                            index,
                            answer.position,
                            answer.label ?? answer.value ?? '',
                          )
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
                          <ArrowRightIcon
                            size={16}
                            color="var(--color-blue-600)"
                            aria-hidden="true"
                          />
                        )}
                      </AnswerButton>
                    </AnswerListItem>
                  ))}
                </AnswerList>
              )}
            </>
          )}

          {error && (
            <ErrorBanner id={errorId} role="alert">
              {error}
            </ErrorBanner>
          )}

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
