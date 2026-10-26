import type { AssessResponse } from '@/lib/schemas';

export interface Step {
  questionId: number;
  questionText: string;
  questionHelp: string | null;
  answers: Array<{ value?: string; label?: string; position: number }>;
  answerChosen: number | null;
}

export interface StepperState {
  steps: Step[];
  current: Omit<Step, 'answerChosen'> & { questionsLeft: number };
  isTerminal: boolean;
  resultKey: string | null;
  resultLabel: string | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Fraction of the form completed, from steps answered so far and the engine's
 * current estimate of questions still to come.
 *
 * Branches differ in depth, so the total isn't known up front: the estimate is
 * re-read from each response and the fraction is recomputed against it. The
 * bar can therefore move backwards when a branch turns out longer than the
 * previous estimate, which is truthful; a fixed total taken from the first
 * question would instead overshoot or stall.
 */
export function computeProgress(answered: number, remaining: number): number {
  const total = answered + Math.max(remaining, 0);
  if (total <= 0) return 0;
  return Math.min(answered / total, 1);
}

export interface ProgressDescription {
  /** Compact text for the visible counter. */
  summary: string;
  /** Full sentence for the progress bar's aria-valuetext. */
  valueText: string;
}

/** Describe progress as answered steps plus an explicitly estimated remainder. */
export function describeProgress(answered: number, remaining: number): ProgressDescription {
  if (remaining <= 1) {
    return {
      summary: `${answered} answered · last question`,
      valueText: `${answered} answered, last question`,
    };
  }
  return {
    summary: `${answered} answered · about ${remaining} left`,
    valueText: `${answered} answered, about ${remaining} remaining`,
  };
}

/** Build a new step from an assess API response (non-terminal). */
export function responseToStep(res: AssessResponse): Omit<Step, 'answerChosen'> & {
  questionsLeft: number;
} {
  return {
    questionId: res.next_question_id ?? 0,
    questionText: res.next_question_text ?? '',
    questionHelp: res.next_question_help ?? null,
    answers: (res.next_answers ?? []) as Array<{
      value?: string;
      label?: string;
      position: number;
    }>,
    questionsLeft: res.questions_left ?? 0,
  };
}

/** Summarise terminal result into a display-friendly string. */
export function formatResultLabel(resultLabel: string | null): string {
  if (!resultLabel) return 'Result determined';
  return resultLabel;
}

/** Return a slug-friendly path segment for a step. */
export function stepToPathEntry(questionId: number, answerPosition: number): string {
  return `${questionId}:${answerPosition}`;
}

interface KeyableQuestion {
  questionId: number;
  questionText: string;
  answers: ReadonlyArray<{ value?: string; label?: string; position: number }>;
}

/**
 * Identity of the question node on screen.
 *
 * The API returns only the group number, but one group hosts several variants
 * with different wording and answer sets (DECISIONS.md section 16), so a group
 * recurring is not a loop. Text plus the answers' positions and labels tell
 * the variants apart. The server-rendered entry question carries raw `value`
 * strings and API responses carry `label`; reading `label ?? value` makes both
 * shapes produce the same key for the same node.
 */
export function questionKey({ questionId, questionText, answers }: KeyableQuestion): string {
  return JSON.stringify([
    questionId,
    questionText,
    answers.map((a) => [a.position, a.label ?? a.value ?? '']),
  ]);
}

/**
 * Whether the next question was already answered on this path. The engine
 * keeps no memory of the path and picks the next question from the group and
 * answer position alone, so continuing from a repeated question retraces
 * steps the user already took.
 */
export function isRepeatedQuestion(answeredKeys: readonly string[], nextKey: string): boolean {
  return answeredKeys.includes(nextKey);
}
