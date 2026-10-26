#!/usr/bin/env node
/**
 * Labels open issues that have no P label (DECISIONS.md section 22).
 *
 * Every run scans all open issues, whatever triggered it, so overlapping or
 * repeated runs are safe: an issue that already has a P label is never touched.
 * A run reports to the rolling `triage-digest` issue only when it applied a
 * label; every run that writes also edits that issue's body with its date, which does not
 * notify. A dry run touches nothing.
 *
 * Labels are written only when BOTH hold:
 *   - the classifier is a real one (`CLASSIFIER_ID` in classify.mjs is not 'stub'), and
 *   - `.github/triage.json` contains {"writes": "on"}.
 * Anything else, including a missing or unreadable file, is a dry run that
 * makes no write request. TRIAGE_DRY_RUN=1 (or true) forces a dry run.
 *
 * A classifier failure on one issue skips that issue only; the run still
 * fails at the end so the failure is visible. Nothing is applied for an
 * issue whose classification failed.
 *
 * Usage:
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name [TRIAGE_DRY_RUN=1] \
 *     node scripts/triage/run.mjs
 *
 * Also reads GITHUB_STEP_SUMMARY, GITHUB_SERVER_URL and GITHUB_RUN_ID when set.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { P_LABELS } from './allowed_writes.mjs';
import {
  CLASSIFIER_ID,
  CONFIDENCE_CUTOFF,
  classifyIssue,
  validateClassifierResult,
} from './classify.mjs';
import {
  MAX_LABEL_WRITES,
  capWrites,
  isOutsideReporter,
  labelNames,
  labelsFor,
  renderDigestComment,
  renderRollingBody,
  renderSummary,
  selectCandidates,
} from './decide.mjs';
import { createGitHub } from './github.mjs';

const CLASSIFY_TIMEOUT_MS = 30_000;

/**
 * Runs the classifier under a deadline. The timer is ref'd on purpose: an unref'd
 * timer (as `AbortSignal.timeout` uses) would let Node exit silently with status 0
 * while a never-settling classifier promise is the only thing left pending.
 */
async function classifyOne(classify, issue, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
  });
  // Issue text is passed verbatim, as data, to the classifier and nowhere else.
  const input = { title: issue.title, body: issue.body ?? '', labels: labelNames(issue) };
  try {
    return validateClassifierResult(
      await Promise.race([classify(input, { signal: controller.signal }), deadline]),
    );
  } catch (error) {
    // Only a fixed category is recorded: error text may echo issue content.
    throw new Error(
      error?.message === 'timeout' ? 'timeout' : 'classifier failed or returned an invalid result',
    );
  } finally {
    clearTimeout(timer);
  }
}

// One failed issue (deleted, locked, a transient error) must not strand the rest.
async function labelOne(io, item, data, applied) {
  try {
    // Re-read right before writing: a human may have labeled or edited the
    // issue since the list call.
    const fresh = await io.getIssue(item.number);
    if (fresh.updated_at !== item.issue.updated_at) {
      data.skipped.push({ number: item.number, reason: 'changed since it was listed' });
    } else if (labelNames(fresh).some((name) => P_LABELS.includes(name))) {
      data.skipped.push({ number: item.number, reason: 'now has a P label' });
    } else {
      await io.addLabels(item.number, item.labels);
      applied.push(item);
      data.applied.push({ number: item.number, labels: item.labels });
    }
  } catch (error) {
    data.errors.push(`#${item.number}: ${error.message}`);
  }
}

async function report(io, data, applied, { runDate, runUrl }) {
  try {
    if (applied.length > 0) {
      await io.postComment(data.digest.number, renderDigestComment(applied));
    }
    await io.setBody(data.digest.number, renderRollingBody(runDate, runUrl));
  } catch (error) {
    data.errors.push(error.message);
  }
}

/**
 * @param {{
 *   io: ReturnType<typeof import('./github.mjs').createGitHub>,
 *   classify?: typeof classifyIssue,
 *   classifierId?: string,
 *   cutoff?: number,
 *   mode: 'write' | 'dry',
 *   modeReason?: string,
 *   classifyTimeoutMs?: number,
 *   now?: () => Date,
 *   runUrl?: string,
 * }} options
 * @returns {Promise<{ exitCode: number, summary: string }>}
 */
export async function runTriage({
  io,
  classify = classifyIssue,
  classifierId = CLASSIFIER_ID,
  cutoff = CONFIDENCE_CUTOFF,
  mode,
  modeReason = 'dry run',
  classifyTimeoutMs = CLASSIFY_TIMEOUT_MS,
  now = () => new Date(),
  runUrl,
}) {
  const stubBlocks = mode === 'write' && classifierId === 'stub';
  const writing = mode === 'write' && !stubBlocks;
  let reason = modeReason;
  if (writing) reason = 'writes are on';
  else if (stubBlocks) reason = 'the classifier is a stub, so nothing is written';

  const data = {
    mode: writing ? 'write' : 'dry',
    reason,
    applied: [],
    planned: [],
    skipped: [],
    failed: [],
    deferred: [],
    multiP: [],
    excludedCount: 0,
    errors: [],
    digest: null,
  };
  const finish = () => ({
    exitCode: data.failed.length > 0 || data.errors.length > 0 ? 1 : 0,
    summary: renderSummary(data),
  });

  const issues = await io.listOpenIssues();
  const { candidates, multiP, excluded } = selectCandidates(issues);
  data.multiP = multiP;
  data.excludedCount = excluded.length;

  // The digest issue is the only place a run reports, so confirm it exists
  // before any label is written.
  if (writing) {
    data.digest = await io.findDigestIssue();
    if (!data.digest) {
      data.errors.push('no open issue labeled triage-digest; nothing was written');
      return finish();
    }
  }

  // Oldest first, and no more than the write cap: a backlog must not use up the
  // job's time limit before the first label is written. The rest wait for the next run.
  const queue = [...candidates].sort((a, b) => a.number - b.number);
  const batch = queue.slice(0, MAX_LABEL_WRITES);

  const planned = [];
  for (const issue of batch) {
    try {
      const result = await classifyOne(classify, issue, classifyTimeoutMs);
      const labels = labelsFor(result, cutoff, issue);
      planned.push({
        number: issue.number,
        issue,
        labels,
        confidence: result.confidence,
        cutoff,
        belowCutoff: result.confidence < cutoff,
        outsideReporter: isOutsideReporter(issue),
        probabilities: result.probabilities,
      });
    } catch (error) {
      data.failed.push({ number: issue.number, reason: error.message });
    }
  }

  const { toWrite, deferred } = capWrites(planned);
  data.deferred = [...queue.slice(MAX_LABEL_WRITES), ...deferred].map((item) => item.number);
  data.planned = toWrite;

  if (!writing) return finish();

  const applied = [];
  try {
    for (const item of toWrite) {
      await labelOne(io, item, data, applied);
    }
  } finally {
    // Report whatever was applied even if the loop stopped early.
    await report(io, data, applied, { runDate: now().toISOString().slice(0, 10), runUrl });
  }
  return finish();
}

/** @returns {{ mode: 'write' | 'dry', reason: string }} */
export function readMode(env, configPath) {
  const forced = env.TRIAGE_DRY_RUN ?? '';
  // Only an unset, empty, '0' or 'false' value leaves the decision to the config file.
  if (forced !== '' && forced !== '0' && forced !== 'false') {
    return { mode: 'dry', reason: 'TRIAGE_DRY_RUN forced a dry run' };
  }
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return config.writes === 'on'
      ? { mode: 'write', reason: 'writes are on' }
      : { mode: 'dry', reason: 'triage.json has writes off' };
  } catch {
    return { mode: 'dry', reason: 'triage.json is missing or unreadable' };
  }
}

/** The transport refuses every write unless the run is in write mode with a real classifier. */
export function transportDryRun(mode, classifierId = CLASSIFIER_ID) {
  return mode !== 'write' || classifierId === 'stub';
}

async function main() {
  // Red until the run finishes, so any early or silent exit fails the job.
  process.exitCode = 1;
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_STEP_SUMMARY, GITHUB_SERVER_URL, GITHUB_RUN_ID } =
    process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    console.error(
      'Usage: GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name node scripts/triage/run.mjs',
    );
    process.exit(1);
  }
  const configPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '.github',
    'triage.json',
  );
  const { mode, reason: modeReason } = readMode(process.env, configPath);
  const io = createGitHub({
    token: GITHUB_TOKEN,
    repo: GITHUB_REPOSITORY,
    dryRun: transportDryRun(mode),
  });
  const runUrl =
    GITHUB_SERVER_URL?.startsWith('https://') && GITHUB_RUN_ID
      ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
      : undefined;
  const { exitCode, summary } = await runTriage({ io, mode, modeReason, runUrl });
  console.log(summary);
  if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${summary}\n`);
  process.exitCode = exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`triage failed: ${error.message}`);
    process.exit(1);
  });
}
