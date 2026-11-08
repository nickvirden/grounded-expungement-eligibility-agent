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

// Shape of the API's tree version. The web never computes or interprets one;
// this only keeps arbitrary URL text out of the tree request.
const TREE_VERSION_RE = /^[0-9a-f]{12}$/;

export function isTreeVersion(value: string): boolean {
  return TREE_VERSION_RE.test(value);
}

/**
 * How the tree used to decode a path relates to the tree the user answered
 * against.
 *  - exact: the tree is the version the path was recorded under.
 *  - superseded: the recorded version's retained snapshot was used.
 *  - unversioned: the path carries no version, so the current tree decodes it.
 *  - unavailable: a version was recorded but its tree could not be loaded.
 *  - invalid: the recorded version is malformed.
 */
export type TreeProvenance = 'exact' | 'superseded' | 'unversioned' | 'unavailable' | 'invalid';

/**
 * Classify a `tree` search parameter against the tree that loaded for it.
 * `requested` is the raw parameter (an array when it repeats), `loadedTree`
 * the fetch result or null on any failure.
 */
export function resolveTreeProvenance(
  requested: string | string[] | undefined,
  loadedTree: Pick<StateTree, 'treeVersion' | 'superseded'> | null,
): TreeProvenance {
  if (requested === undefined || requested === '') return 'unversioned';
  if (typeof requested !== 'string' || !isTreeVersion(requested)) return 'invalid';
  // An API that predates versioning ignores ?version= and returns the current
  // tree without a treeVersion, which must not read as a match.
  if (!loadedTree || loadedTree.treeVersion !== requested) return 'unavailable';
  return loadedTree.superseded ? 'superseded' : 'exact';
}

/** Note shown with a decoded path whose wording may differ from what the user saw. */
export function provenanceNote(provenance: TreeProvenance): string | null {
  switch (provenance) {
    case 'exact':
      return null;
    case 'superseded':
      return 'Shown as worded when you answered. Some questions have since been updated.';
    default:
      return 'Shown in current wording, which may differ from what you saw.';
  }
}
