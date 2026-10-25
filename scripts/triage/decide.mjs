/**
 * Pure triage decisions: which issues are candidates, which labels a
 * classification maps to, and the text of what gets reported. No I/O.
 *
 * Reports cite issues by number only. Issue titles and bodies come from
 * strangers and never appear in a comment, summary or rolling-issue body.
 */
import { NEEDS_VERIFICATION, P_LABELS } from './allowed_writes.mjs';
import { QUESTION_IDS } from './classify.mjs';

export const DIGEST_LABEL = 'triage-digest';
export const MAINTAINER = '@nickvirden';
export const MAX_LABEL_WRITES = 20;

// Probability at or above which a question is reported as having "fired".
const FIRED_THRESHOLD = 0.5;
const TRUSTED_ASSOCIATIONS = ['OWNER', 'MEMBER', 'COLLABORATOR'];

export const labelNames = (issue) =>
  (issue.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name));

/**
 * @param {object[]} issues Open issues as returned by the list endpoint.
 * @returns {{
 *   candidates: object[],
 *   multiP: number[],
 *   excluded: { number: number, reason: string }[],
 * }}
 */
export function selectCandidates(issues) {
  const candidates = [];
  const multiP = [];
  const excluded = [];
  for (const issue of issues) {
    const names = labelNames(issue);
    const pCount = names.filter((name) => P_LABELS.includes(name)).length;
    if (issue.pull_request) {
      excluded.push({ number: issue.number, reason: 'pull request' });
    } else if (names.includes(DIGEST_LABEL)) {
      excluded.push({ number: issue.number, reason: 'digest issue' });
    } else if (pCount > 1) {
      multiP.push(issue.number);
    } else if (pCount === 1) {
      excluded.push({ number: issue.number, reason: 'already has a P label' });
    } else {
      candidates.push(issue);
    }
  }
  return { candidates, multiP, excluded };
}

export const isOutsideReporter = (issue) =>
  !TRUSTED_ASSOCIATIONS.includes(issue.author_association);

/**
 * Labels to add to an unlabeled issue. The P label is always first.
 * A report from outside the project is always flagged for verification, but
 * that never moves the P level.
 */
export function labelsFor(result, cutoff, issue) {
  const belowCutoff = result.confidence < cutoff;
  const labels = belowCutoff ? ['P2'] : [result.priority];
  if (belowCutoff || result.needsVerification || isOutsideReporter(issue)) {
    labels.push(NEEDS_VERIFICATION);
  }
  return labels;
}

const priorityRank = (item) => P_LABELS.indexOf(item.labels.find((l) => P_LABELS.includes(l)));

/** P0 and P1 first, then by issue number so output is stable. */
export function sortByPriority(items) {
  return [...items].sort((a, b) => priorityRank(a) - priorityRank(b) || a.number - b.number);
}

/** Highest-priority changes first; the remainder waits for the next run. */
export function capWrites(items, max = MAX_LABEL_WRITES) {
  const sorted = sortByPriority(items);
  return { toWrite: sorted.slice(0, max), deferred: sorted.slice(max) };
}

const formatProbability = (value) => (Number.isFinite(value) ? Number(value).toFixed(2) : '?');

function describeReason(change) {
  const parts = [];
  if (change.belowCutoff) {
    parts.push(
      `confidence ${formatProbability(change.confidence)} below cutoff ${formatProbability(change.cutoff)}`,
    );
  }
  if (change.outsideReporter) parts.push('outside reporter');
  const fired = QUESTION_IDS.filter((id) => change.probabilities?.[id] >= FIRED_THRESHOLD);
  if (fired.length > 0) {
    parts.push(
      fired.map((id) => `${id} ${formatProbability(change.probabilities[id])}`).join(', '),
    );
  }
  return parts.length > 0 ? parts.join('; ') : 'no question fired';
}

/**
 * @param {{
 *   number: number,
 *   labels: string[],
 *   confidence: number,
 *   cutoff: number,
 *   belowCutoff: boolean,
 *   outsideReporter: boolean,
 *   probabilities: Record<string, number>,
 * }[]} changes
 */
export function renderDigestComment(changes) {
  const lines = [
    `${MAINTAINER} the triage workflow labeled ${changes.length} issue(s). P0 and P1 are listed first.`,
    '',
  ];
  for (const change of sortByPriority(changes)) {
    lines.push(
      `- #${Number(change.number)}: ${change.labels.join(' + ')} (${describeReason(change)})`,
    );
  }
  return lines.join('\n');
}

export function renderRollingBody(runDate, runUrl) {
  const lines = [
    'Rolling issue the triage workflow reports to. Do not close it.',
    '',
    'The workflow comments here only when a run labels something. A quiet week has no comment; the date below shows the last run that finished.',
    '',
    `Last run: ${runDate}${runUrl ? ` ([run](${runUrl}))` : ''}`,
  ];
  return lines.join('\n');
}

/**
 * Markdown for the job summary.
 *
 * @param {{
 *   mode: 'write' | 'dry',
 *   reason: string,
 *   applied: { number: number, labels: string[] }[],
 *   planned: { number: number, labels: string[] }[],
 *   skipped: { number: number, reason: string }[],
 *   failed: { number: number, reason: string }[],
 *   deferred: number[],
 *   multiP: number[],
 *   excludedCount: number,
 *   errors: string[],
 *   digest: { number: number, others: number[] } | null,
 * }} data
 */
export function renderSummary(data) {
  const list = (items) => items.map((i) => `- #${i.number}: ${i.labels.join(' + ')}`);
  const lines = ['## Triage run', '', `Mode: ${data.mode} (${data.reason})`, ''];
  if (data.mode === 'write') {
    lines.push(`Labeled: ${data.applied.length}`, ...list(data.applied));
  } else {
    lines.push(`Would label: ${data.planned.length}`, ...list(data.planned));
  }
  const section = (title, items) => {
    if (items.length > 0) lines.push('', `${title}: ${items.length}`, ...items);
  };
  section(
    'Skipped',
    data.skipped.map((i) => `- #${i.number}: ${i.reason}`),
  );
  section(
    'Classification failed (nothing applied)',
    data.failed.map((i) => `- #${i.number}: ${i.reason}`),
  );
  section(
    'Deferred past the per-run cap',
    data.deferred.map((n) => `- #${n}`),
  );
  section(
    'More than one P label (reported only)',
    data.multiP.map((n) => `- #${n}`),
  );
  section(
    'Errors',
    data.errors.map((e) => `- ${e}`),
  );
  if (data.digest?.others.length > 0) {
    lines.push(
      '',
      `Several open issues carry ${DIGEST_LABEL}; using #${data.digest.number}. Others: ${data.digest.others.map((n) => `#${n}`).join(', ')}`,
    );
  }
  lines.push('', `Not candidates: ${data.excludedCount}`);
  return lines.join('\n');
}
