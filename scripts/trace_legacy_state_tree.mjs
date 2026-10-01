#!/usr/bin/env node
/**
 * Independently traces the legacy questionnaire-api decision tree by calling
 * its route handler directly, using only its own request/response contract
 * (questionId, answerPosition) -> raw response. This script shares no logic
 * with scripts/extract_state_tree.mjs -- it doesn't know about node IDs,
 * variants, or how extraction builds the committed tree JSON. Its only job
 * is to record what the legacy handler actually says for every reachable
 * (questionId, answerPosition) pair, as a ground-truth fixture that the
 * extracted tree can be checked against.
 *
 * Usage:
 *   node scripts/trace_legacy_state_tree.mjs <state> <path-to-legacy-state-file>
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'apps', 'api', 'tests', 'fixtures');

const state = process.argv[2];
const legacyFilePath = process.argv[3];

if (!state || !legacyFilePath) {
  console.error(
    'Usage: node scripts/trace_legacy_state_tree.mjs <state> <path-to-legacy-state-file>',
  );
  process.exit(1);
}

mkdirSync(OUTPUT_DIR, { recursive: true });

const fileContent = readFileSync(legacyFilePath, 'utf8');
const sourceSha256 = createHash('sha256').update(fileContent).digest('hex');

function createMockRouter() {
  const router = {
    post(_path, fn) {
      router._handler = fn;
    },
  };
  return router;
}

const mockResults = {
  common: { dnq: 'Does Not Qualify', dnqy: 'Does Not Qualify Yet', research: 'Research' },
  texas: {
    expungement: 'Texas Expungement',
    juvenileSealing: 'Texas Juvenile Record Sealing',
    dwiRecordSealing: 'Texas DWI Record Sealing',
    convictionSetAside: 'Texas Conviction Set Aside',
    felonyRecordSealing: 'Texas Felony Record Sealing',
    automaticRecordSealing: 'Texas Automatic Record Sealing',
    pardonBook: 'Texas Pardon eBook',
    misdemeanorRecordSealing: 'Texas Misdemeanor Record Sealing',
  },
  florida: {
    expungement: 'Florida Expungement',
    recordSealing: 'Florida Record Sealing',
  },
};

function currentValue(variable, newQuestionId, currentAnswer) {
  return variable[newQuestionId] ? variable[newQuestionId][newQuestionId][currentAnswer] : false;
}

function sandboxRequire(mod) {
  if (mod === 'express') return { Router: createMockRouter };
  if (mod === '../constants') return { results: mockResults };
  if (mod === '../utils') return { currentValue };
  throw new Error(`Unexpected require: ${mod}`);
}

const sandbox = new Function('require', 'module', 'exports', fileContent);
const mockModule = { exports: {} };
sandbox(sandboxRequire, mockModule, mockModule.exports);

const routeHandler = mockModule.exports._handler;
if (!routeHandler) {
  console.error('Could not extract route handler from module');
  process.exit(1);
}

function callHandler(questionId, answerValue) {
  let response = null;
  const req = {
    accepts() {},
    is() {
      return true;
    },
    body: { question: { id: questionId }, answer: { value: String(answerValue) } },
  };
  const res = {
    status() {
      return res;
    },
    json(data) {
      response = data;
    },
  };
  routeHandler(req, res);
  return response;
}

// Walk the tree purely off each response's own `new_answers` list -- this is
// the same contract the real frontend relies on to render answer buttons and
// post the next request.
const trace = {};
const visited = new Set();

function walk(questionId, answers) {
  for (const answer of answers) {
    const key = `${questionId}:${answer.position}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const response = callHandler(questionId, answer.position);
    trace[key] = response;

    if (response?.new_question) {
      walk(response.new_question.id, response.new_answers ?? []);
    }
  }
}

const root = callHandler(-1, 0);
trace.root = root;
walk(root.new_question.id, root.new_answers ?? []);

const fixture = {
  state,
  // Not the literal argv path -- that's wherever the legacy checkout happens to
  // live on whichever machine ran this, not something worth committing. The
  // hash above is what actually pins this fixture to a specific source file.
  sourceFile: `questionnaire-api/states/${state}.js`,
  sourceSha256,
  tracedAt: new Date().toISOString(),
  reachableCount: Object.keys(trace).length,
  trace,
};

const outputPath = join(OUTPUT_DIR, `${state}_legacy_trace.json`);
writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(
  `✓ Traced ${state}: ${Object.keys(trace).length} reachable (questionId, answerPosition) entries (including root)`,
);
console.log(`  Output: ${outputPath}`);
