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

/** Compute 0-based progress (0–1) from the initial total and current remaining. */
export function computeProgress(initial: number, remaining: number): number {
  if (initial <= 0) return 0;
  const answered = initial - remaining;
  return Math.min(answered / initial, 1);
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
