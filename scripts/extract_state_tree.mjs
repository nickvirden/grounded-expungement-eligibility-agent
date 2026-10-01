#!/usr/bin/env node
/**
 * Extracts legacy questionnaire-api decision trees into structured JSON.
 *
 * The legacy state files (e.g. texas.js) embed questions, answers, help text,
 * and transition logic inside an Express route handler closure. This script
 * mocks the Express router and the handler's `currentValue` helper, then
 * walks the real decision tree by replaying the handler's own request/response
 * contract starting from the true root question.
 *
 * The legacy handler has no memory of which question *variant* the user is
 * on -- it only knows the current question group number and the position of
 * the answer the user picked. A single question group number can host
 * several distinct question variants (different text, different answers),
 * reached via different paths through the tree. This script discovers each
 * variant's identity (group, variant) directly from the arguments the
 * handler's own `currentValue` lookup is called with -- it does not
 * reimplement the override/redirect chain itself.
 *
 * Usage:
 *   node scripts/extract_state_tree.mjs <state> <path-to-legacy-state-file>
 *
 * Example:
 *   node scripts/extract_state_tree.mjs texas /path/to/questionnaire-api/states/texas.js
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'packages', 'shared', 'state-trees');

const state = process.argv[2];
const legacyFilePath = process.argv[3];

if (!state || !legacyFilePath) {
  console.error('Usage: node scripts/extract_state_tree.mjs <state> <path-to-legacy-state-file>');
  process.exit(1);
}

mkdirSync(OUTPUT_DIR, { recursive: true });

const fileContent = readFileSync(legacyFilePath, 'utf8');

// Mock express router: the legacy file does `router.post('/', handler)` then
// `module.exports = router`. We only need to capture the handler function.
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

// Every lookup in the legacy handler goes through `currentValue(arr, g, v)`,
// implemented as `arr[g] ? arr[g][g][v] : false`. The handler calls this once
// per data array (questions/answers/helpText/endpoint) per request, always
// with the SAME (g, v) pair -- the pair it resolved via `newQuestionId` and
// `currentAnswer` after running its override/redirect chain. Recording the
// arguments of any one of those calls tells us the true destination
// (group, variant) without re-deriving the override chain ourselves.
let lastLookup = null;
function mockCurrentValue(variable, newQuestionId, currentAnswer) {
  lastLookup = { group: newQuestionId, variant: currentAnswer };
  return variable[newQuestionId] ? variable[newQuestionId][newQuestionId][currentAnswer] : false;
}

function sandboxRequire(mod) {
  if (mod === 'express') return { Router: createMockRouter };
  if (mod === '../constants') return { results: mockResults };
  if (mod === '../utils') return { currentValue: mockCurrentValue };
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

/** Calls the legacy handler exactly as the real frontend would. */
function callHandler(questionId, answerValue) {
  let response = null;
  lastLookup = null;
  const req = {
    accepts() {},
    is() {
      return true;
    },
    // The override chain compares currentAnswer as a string (e.g. `currentAnswer === '12'`),
    // so answer values must be sent as strings, exactly like the real frontend does.
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
  return { response, lookup: lastLookup };
}

// --- Walk the real tree, starting from the true root question. ---
//
// `newQuestionId = currentQuestion + 1`, so the root (group 0) is reached by
// sending currentQuestion = -1. Group 0 only defines a single answer key (0),
// so the seed answer value must be 0.
const nodes = new Map(); // "<group>-<variant>" -> node data
const transitions = [];
const visitedFromKeys = new Set(); // "<fromGroup>:<fromPosition>" -- handler has no variant memory on the FROM side either

function resultValueToString(value) {
  return typeof value === 'string' ? value : undefined;
}

function recordNode(group, variant, response) {
  // `lookup.variant` comes straight from the request's `answer.value`, which
  // is always sent as a string (the override chain depends on string
  // comparison) -- normalize to an integer so node identity is numeric.
  const groupNum = Number(group);
  const variantNum = Number(variant);
  const nodeId = `${groupNum}-${variantNum}`;
  if (nodes.has(nodeId)) return nodeId;
  nodes.set(nodeId, {
    group: groupNum,
    variant: variantNum,
    question: response.new_question.question,
    help: response.helpText ?? null,
    answers: response.new_answers ?? [],
    questionsLeft: response.questionsLeft ?? null,
  });
  return nodeId;
}

function exploreFrom(fromGroup, answers) {
  for (const answer of answers) {
    const fromKey = `${fromGroup}:${answer.position}`;
    if (visitedFromKeys.has(fromKey)) continue;
    visitedFromKeys.add(fromKey);

    const { response, lookup } = callHandler(fromGroup, answer.position);
    if (!response || !lookup) {
      throw new Error(
        `Legacy handler produced no response for (questionId=${fromGroup}, answerPosition=${answer.position})`,
      );
    }

    const isResult = !response.new_question;
    if (isResult) {
      const value = resultValueToString(response.value);
      if (value === undefined) {
        throw new Error(
          `Result value is not a string for (questionId=${fromGroup}, answerPosition=${answer.position}): ${JSON.stringify(response.value)}`,
        );
      }
      transitions.push({
        from: { questionId: fromGroup, answerPosition: answer.position },
        to: { type: 'result', value },
      });
      continue;
    }

    const { group, variant } = lookup;
    const isNewNode = !nodes.has(`${Number(group)}-${Number(variant)}`);
    const nodeId = recordNode(group, variant, response);

    transitions.push({
      from: { questionId: fromGroup, answerPosition: answer.position },
      to: { type: 'question', questionId: group, nodeId },
    });

    if (isNewNode) {
      exploreFrom(group, response.new_answers ?? []);
    }
  }
}

const { response: rootResponse, lookup: rootLookup } = callHandler(-1, 0);
if (!rootResponse?.new_question || !rootLookup) {
  throw new Error(
    'Could not resolve the root question (expected questionId=-1, answerPosition=0 to return a question)',
  );
}
const entryNodeId = recordNode(rootLookup.group, rootLookup.variant, rootResponse);
exploreFrom(rootLookup.group, rootResponse.new_answers ?? []);

// --- Validate the extracted graph before writing anything out. ---

const errors = [];

for (const [nodeId, node] of nodes) {
  if (!node.question || !Array.isArray(node.answers)) {
    errors.push(`Node ${nodeId} is missing a question or answers array`);
  }
  const textSeen = new Set();
  for (const answer of node.answers) {
    if (textSeen.has(answer.value)) {
      errors.push(`Node ${nodeId} has duplicate answer text: ${JSON.stringify(answer.value)}`);
    }
    textSeen.add(answer.value);
  }
}

// Every answer in every node must have a matching outgoing transition.
const transitionKeys = new Set(
  transitions.map((t) => `${t.from.questionId}:${t.from.answerPosition}`),
);
for (const [nodeId, node] of nodes) {
  for (const answer of node.answers) {
    const key = `${node.group}:${answer.position}`;
    if (!transitionKeys.has(key)) {
      errors.push(
        `Node ${nodeId} answer at position ${answer.position} has no matching transition`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`Validation failed for ${state} tree extraction:`);
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

// --- Build the final JSON structure. ---

const nodesJson = {};
for (const [nodeId, node] of nodes) {
  nodesJson[nodeId] = node;
}

const treeJson = {
  state,
  version: '2.0.0',
  extractedFrom: `questionnaire-api/states/${state}.js`,
  extractedAt: new Date().toISOString(),
  entryNodeId,
  nodes: nodesJson,
  results: {
    expungement: 'Texas Expungement',
    juvenileSealing: 'Texas Juvenile Record Sealing',
    dwiRecordSealing: 'Texas DWI Record Sealing',
    convictionSetAside: 'Texas Conviction Set Aside',
    felonyRecordSealing: 'Texas Felony Record Sealing',
    automaticRecordSealing: 'Texas Automatic Record Sealing',
    pardonBook: 'Texas Pardon eBook',
    misdemeanorRecordSealing: 'Texas Misdemeanor Record Sealing',
    dnq: 'Does Not Qualify',
    dnqy: 'Does Not Qualify Yet',
    research: 'Research',
  },
  transitions,
};

const outputPath = join(OUTPUT_DIR, `${state}.json`);
writeFileSync(outputPath, `${JSON.stringify(treeJson, null, 2)}\n`);
console.log(`✓ Extracted ${state} tree: ${nodes.size} nodes, ${transitions.length} transitions`);
console.log(`  Entry node: ${entryNodeId}`);
console.log(`  Output: ${outputPath}`);
