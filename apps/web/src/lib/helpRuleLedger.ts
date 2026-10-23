import { outlineHelp } from './helpOutline';
import ledgerFile from './helpRuleLedger.json';
import { type HelpContent, countAnswerRules, plainText, transformHelp } from './helpTransform';
import { sha256 } from './sha256';

// The "How to answer" box states a rule in the app's own voice, so it is shown only when a
// person has reviewed exactly this combination of (state, question, rule sentence, whole help
// text, answer labels) and the words still match what they reviewed. Code cannot judge whether a
// sentence agrees with its question; it can only check that a recorded human review still
// applies. Default-deny: anything not approved renders as ordinary bold text inside the help
// body, never hidden or reworded.
//
// The review covers the whole help text, not only the rule sentence: no list of phrasings can
// recognise every way a body could gain a contradicting instruction, so any change anywhere in
// the words of the reviewed help withdraws the box until a person reviews it again. Formatting
// that leaves the words unchanged (bold, line breaks, list structure) does not.
//
// The client knows the question group but not the node variant (DECISIONS.md section 16, and
// issue #27), so the render path looks entries up by content hash. The `<state>:<nodeId>` keys
// are for people reviewing the file and for the test that ties every entry to a node in the tree.

/**
 * One reviewed node, as stored in helpRuleLedger.json under the key `<state>:<nodeId>`:
 *
 *   { "reviewed": true, "hash": "<64 hex>", "fields": { "question", "rule", "help", "answers" },
 *     "reviewedBy": "<name>", "reviewedAt": "<ISO 8601 date>" }
 *
 * Produce `hash` and `fields` with `pnpm --filter web help:review <state> <nodeId>`; write
 * `reviewedBy` and `reviewedAt` yourself, after reading the sheet.
 */
export interface LedgerEntry {
  reviewed: true;
  /** SHA-256 of the normalised review text (see `reviewText`). */
  hash: string;
  /** Per-field fingerprints, so a failing check can name which part changed. */
  fields: { question: string; rule: string; help: string; answers: string };
  reviewedBy: string;
  /** ISO 8601 date or timestamp of the review. */
  reviewedAt: string;
  note?: string;
}

export interface Ledger {
  version: 1;
  /** Keyed by `<state>:<nodeId>`. */
  entries: Record<string, LedgerEntry>;
}

export interface ReviewInput {
  state: string;
  /** The question as delivered by the API (legacy HTML allowed). */
  question: string;
  /** The rule sentence as the transform extracted it. Already decoded plain text, not HTML. */
  rule: string;
  /** The whole help string as delivered by the API (legacy HTML allowed). */
  help: string;
  /** Answer labels in display order, as the client renders them (see `answerLabels`). */
  answers: string[];
}

/** An answer as the tree stores it (`value`) or as the client's parsed response carries it. */
export interface AnswerShape {
  label?: string | null;
  value?: string | null;
}

/**
 * The strings the user sees on the answer buttons. This is exactly the client's
 * `answer.label ?? answer.value ?? ''`, so a reviewed hash is computed from rendered text.
 */
export const answerLabels = (answers: readonly AnswerShape[]): string[] =>
  answers.map((a) => a.label ?? a.value ?? '');

export type Hash = (s: string) => string;

const HEX_SHA256 = /^[0-9a-f]{64}$/;
// Separators between fields and between answers. They are stripped from content (see `norm`)
// so no text can forge a field boundary and make two different reviews collide.
const FIELD_SEP = '\u001f';
const ANSWER_SEP = '\u001e';

/**
 * Plain text, NFC, whitespace collapsed. Case and punctuation are kept on purpose: "NOT" versus
 * "not", or a dropped comma, can change legal meaning and so must trigger a re-review.
 */
const collapse = (s: string) =>
  s
    .normalize('NFC')
    .split(FIELD_SEP)
    .join(' ')
    .split(ANSWER_SEP)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

/** HTML in (question, answers, help), normalised plain text out. */
const normHtml = (s: string) => collapse(plainText(s));

/**
 * The rule is already decoded text. Parsing it as HTML again would read a decoded `<` as markup,
 * hash something other than what is shown, and truncate text such as "if x<y then".
 */
const normPlain = collapse;

/** The exact text that is hashed, plus its parts. */
export function reviewText(i: ReviewInput) {
  const question = normHtml(i.question);
  const rule = normPlain(i.rule);
  const help = normHtml(i.help);
  const answers = i.answers.map(normHtml).join(ANSWER_SEP);
  const all = [
    `state=${i.state}`,
    `question=${question}`,
    `rule=${rule}`,
    `help=${help}`,
    `answers=${answers}`,
  ].join(FIELD_SEP);
  return { question, rule, help, answers, all };
}

/**
 * The hash a ledger entry must carry for this content, and short per-field hashes. Used when
 * adding an entry (see scripts/reviewHelpRule.ts) and by the tests.
 */
export function fingerprint(i: ReviewInput, hash: Hash = sha256) {
  const t = reviewText(i);
  return {
    hash: hash(t.all),
    fields: {
      question: hash(t.question).slice(0, 12),
      rule: hash(t.rule).slice(0, 12),
      help: hash(t.help).slice(0, 12),
      answers: hash(t.answers).slice(0, 12),
    },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/;
const EARLIEST_REVIEW_YEAR = 2024;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Format and invisible characters that can make a blank name look filled in: zero-width and
// bidi marks, Braille blank and Hangul fillers (all rendered as spaces), plus any whitespace.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Z}\s\u2800\u115f\u1160\u3164\uffa0]/gu;
const STAND_INS = new Set(['tbd', 'todo', '-']);

/**
 * A reviewer of record: a visible name that is not a stand-in. This cannot prove who reviewed;
 * the control is a human reading the ledger file in code review.
 */
const isReviewer = (v: unknown): v is string => {
  if (typeof v !== 'string') return false;
  const folded = v.normalize('NFKC').replace(INVISIBLE, '').toLowerCase();
  return folded !== '' && !folded.includes('placeholder') && !STAND_INS.has(folded);
};

/** A calendar-valid ISO date or timestamp from 2024 on, at most a day ahead of now. */
const isIsoDate = (v: unknown): v is string => {
  if (typeof v !== 'string') return false;
  const m = ISO_DATE.exec(v);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day0 = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    day0.getUTCFullYear() === year && day0.getUTCMonth() === month - 1 && day0.getUTCDate() === day;
  const at = Date.parse(v);
  return (
    roundTrips && year >= EARLIEST_REVIEW_YEAR && !Number.isNaN(at) && at <= Date.now() + ONE_DAY_MS
  );
};

/** The ledger as the render path reads it: a Map, so lookups never touch an object prototype. */
export interface ParsedLedger {
  version: 1;
  entries: ReadonlyMap<string, LedgerEntry>;
}

/**
 * Reads a ledger file value defensively. Anything that is not a well-formed ledger, and any
 * entry that is not a reviewed entry with a 64-hex hash, a named reviewer and a plausible ISO
 * date, is treated as absent, so a damaged or unfinished file can only ever promote less. The
 * entries are a Map, so a `__proto__` or `constructor` key is an ordinary key.
 */
export function parseLedger(value: unknown): ParsedLedger {
  const entries = new Map<string, LedgerEntry>();
  if (isRecord(value) && value.version === 1 && isRecord(value.entries)) {
    for (const [key, entry] of Object.entries(value.entries)) {
      if (
        isRecord(entry) &&
        entry.reviewed === true &&
        typeof entry.hash === 'string' &&
        HEX_SHA256.test(entry.hash) &&
        isReviewer(entry.reviewedBy) &&
        isIsoDate(entry.reviewedAt)
      ) {
        entries.set(key, entry as unknown as LedgerEntry);
      }
    }
  }
  return { version: 1, entries };
}

/** A Set of approved hashes, built once so each render is a single lookup. */
export const approvedHashes = (ledger: unknown): ReadonlySet<string> =>
  new Set([...parseLedger(ledger).entries.values()].map((e) => e.hash));

const committedHashes = approvedHashes(ledgerFile);

export interface HelpDecision {
  content: HelpContent;
  promoted: boolean;
  // The render path cannot tell "never reviewed" from "changed since review" (it has no node id);
  // the ledger test can, and reports which.
  reason:
    | 'promoted'
    | 'no-rule'
    | 'more-than-one-rule'
    | 'rule-not-in-first-paragraph'
    | 'not-reviewed';
}

/**
 * Transforms a help string and promotes its rule sentence only when both hold: the help has
 * exactly one "answer yes/no" sentence, and its review hash is approved. The hash covers the
 * question, the rule, the whole help text and the answers, so the single-sentence check is a
 * structural precondition and not the safety mechanism: a body that gains an instruction in any
 * phrasing changes the hash and withdraws the box.
 */
export function decideHelp(
  input: { state: string; question: string; help: string; answers: readonly AnswerShape[] },
  approved: ReadonlySet<string> = committedHashes,
  hash: Hash = sha256,
): HelpDecision {
  const structural = transformHelp(input.help, { directiveGate: 'single-rule' });
  if (structural.directive === null) {
    const count = countAnswerRules(input.help);
    const reason =
      count === 0 ? 'no-rule' : count > 1 ? 'more-than-one-rule' : 'rule-not-in-first-paragraph';
    return { content: structural, promoted: false, reason };
  }
  const { hash: current } = fingerprint(
    {
      state: input.state,
      question: input.question,
      rule: structural.directive,
      help: input.help,
      answers: answerLabels(input.answers),
    },
    hash,
  );
  if (approved.has(current)) return { content: structural, promoted: true, reason: 'promoted' };
  return {
    content: transformHelp(input.help, { directiveGate: 'never' }),
    promoted: false,
    reason: 'not-reviewed',
  };
}

/** The rule sentence the transform would promote for this help, or null if there is none. */
export const candidateRule = (help: string): string | null =>
  transformHelp(help, { directiveGate: 'single-rule' }).directive;

interface SheetNode {
  question: string;
  help: string | null;
  answers: readonly AnswerShape[];
}

const fingerprintOf = (state: string, n: SheetNode) => {
  const rule = n.help ? candidateRule(n.help) : null;
  if (rule === null || n.help === null) return null;
  const input = {
    state,
    question: n.question,
    rule,
    help: n.help,
    answers: answerLabels(n.answers),
  };
  return { input, ...fingerprint(input) };
};

/**
 * The review sheet for one node: exactly what a reviewer must read and approve, plus the
 * ledger fields to record. `reviewedBy` and `reviewedAt` are deliberately not produced; the
 * reviewer writes them. `nodes` is the whole tree, so the sheet can say which other nodes the
 * approval also covers.
 */
export function formatReviewSheet(
  state: string,
  nodeId: string,
  nodes: Readonly<Record<string, SheetNode>>,
): string {
  const node = Object.hasOwn(nodes, nodeId) ? nodes[nodeId] : undefined;
  if (!node) return `No node ${nodeId} in the ${state} tree.`;
  const fp = node ? fingerprintOf(state, node) : null;
  if (!fp) {
    return `${state}:${nodeId} has no single "answer yes/no" rule; it cannot be promoted.`;
  }
  const t = reviewText(fp.input);
  const alsoCovered = Object.entries(nodes)
    .filter(([id, n]) => id !== nodeId && fingerprintOf(state, n)?.hash === fp.hash)
    .map(([id]) => `${state}:${id}`);
  return [
    `Review sheet for ${state}:${nodeId}`,
    '',
    `Question:  ${t.question}`,
    `Rule:      ${t.rule}`,
    ...t.answers.split(ANSWER_SEP).map((a, i) => `Answer ${i + 1}:  ${a}`),
    '',
    'Full help text, with its structure (the approval covers all of its words, not only the rule):',
    '',
    outlineHelp(fp.input.help),
    '',
    'Approving this entry covers the words of the question, the rule, every answer and the entire',
    'help text. Any change to those words withdraws the box until it is reviewed again.',
    'Formatting changes that leave the words the same (bold, line breaks, list structure) do not.',
    ...(alsoCovered.length > 0
      ? [`The same approval also covers nodes with identical content: ${alsoCovered.join(', ')}.`]
      : []),
    '',
    'Add this entry to apps/web/src/lib/helpRuleLedger.json only after reading the above, and',
    'fill in reviewedBy and reviewedAt yourself:',
    '',
    JSON.stringify(
      {
        [`${state}:${nodeId}`]: {
          reviewed: true,
          hash: fp.hash,
          fields: fp.fields,
          reviewedBy: '',
          reviewedAt: '',
        },
      },
      null,
      2,
    ),
  ].join('\n');
}
