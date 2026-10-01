import type { StateTree } from './schemas';

export type DecisionPathStep =
  | { kind: 'answered'; raw: string; questionHtml: string; answerHtmls: string[] }
  | { kind: 'unrecognized'; raw: string };

const PATH_ENTRY_RE = /^q?(\d+):a?(\d+)$/;

/**
 * Decode a traversed path (e.g. `["0:0", "1:1"]` from the Quick Form, or
 * `["q0:a0", "q1:a1"]` from the Talk-to-Agent harness) into the question and
 * answer text shown at each step.
 *
 * The rule engine (apps/api/app/engine/rule_engine.py) matches the FIRST
 * transition whose `(questionId, answerPosition)` equals the given pair,
 * globally across the whole tree -- not scoped to the node the path is
 * currently "at". This walk replicates that exact first-match global lookup
 * so the decoded path agrees with what the engine actually computed, even
 * though the question/answer text displayed still comes from whichever node
 * is current. Answer `position` is also not always unique within a node (two
 * distinct answers can share one position), so a step can carry more than one
 * matching answer.
 */
export function decodeDecisionPath(
  path: readonly string[],
  tree: StateTree | null,
): DecisionPathStep[] {
  let cursor = tree?.nodes[tree.entryNodeId] ?? null;

  return path.map((rawEntry) => {
    const raw = rawEntry.trim();
    const match = PATH_ENTRY_RE.exec(raw);

    if (!match) {
      cursor = null;
      return { kind: 'unrecognized', raw };
    }

    const questionId = Number(match[1]);
    const answerPosition = Number(match[2]);

    const matchingAnswers =
      cursor?.group === questionId
        ? cursor.answers.filter((a) => a.position === answerPosition)
        : [];

    const step: DecisionPathStep =
      matchingAnswers.length > 0
        ? {
            kind: 'answered',
            raw,
            questionHtml: (cursor as NonNullable<typeof cursor>).question,
            answerHtmls: matchingAnswers.map((a) => a.value),
          }
        : { kind: 'unrecognized', raw };

    const transition = tree?.transitions.find(
      (t) => t.from.questionId === questionId && t.from.answerPosition === answerPosition,
    );

    cursor =
      transition?.to.type === 'question' ? (tree?.nodes[transition.to.nodeId] ?? null) : null;

    return step;
  });
}
