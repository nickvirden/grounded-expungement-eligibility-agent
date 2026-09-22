#!/usr/bin/env node
/**
 * Extracts legacy questionnaire-api decision trees into structured JSON.
 *
 * The legacy state files (e.g. texas.js) embed questions, answers, help text,
 * and transition logic inside an Express route handler closure. This script
 * mocks the Express router, evaluates the module, and captures the internal
 * state by intercepting the route handler's response to synthetic requests.
 *
 * Usage:
 *   node scripts/extract_state_tree.mjs <state> <path-to-legacy-state-file>
 *
 * Example:
 *   node scripts/extract_state_tree.mjs texas /path/to/questionnaire-api/states/texas.js
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

/**
 * Strategy: We can't easily extract the closure variables directly, so we
 * use a synthetic request approach. We send every possible (questionId, answerPosition)
 * pair to the route handler and record what comes back. This gives us the full
 * reachable graph of the decision tree.
 */

const require = createRequire(import.meta.url);

// Mock express router
function createMockRouter() {
  let handler = null;
  const router = {
    post(path, fn) {
      handler = fn;
    },
    handler() {
      return handler;
    },
  };
  return router;
}

// Patch require so the legacy file gets our mock
const Module = await import('node:module');
const originalRequire = createRequire(legacyFilePath);

// We need to evaluate the file with mocked express
const fileContent = readFileSync(legacyFilePath, 'utf8');

// Extract the data arrays directly using regex/parsing from the source
// This is more reliable than trying to mock the entire express/constants ecosystem
function extractTree(source, stateName) {
  const nodes = new Map();
  const results = new Map();
  const transitions = [];

  // We'll use a different approach: directly parse the arrays from source
  // by evaluating a sandboxed version with mock dependencies
  const mockExpress = {
    Router() {
      const r = {
        post(_, fn) {
          r._handler = fn;
        },
      };
      return r;
    },
  };

  // Build a mock constants/results object
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

  const mockCurrentValue = (variable, newQuestionId, currentAnswer) =>
    variable[newQuestionId] ? variable[newQuestionId][newQuestionId][currentAnswer] : false;

  // Create a sandboxed require function
  const sandboxRequire = (mod) => {
    if (mod === 'express') return mockExpress;
    if (mod === '../constants') return { results: mockResults };
    if (mod === '../utils') return { currentValue: mockCurrentValue };
    throw new Error(`Unexpected require: ${mod}`);
  };

  // Evaluate the module in a sandbox
  const sandbox = new Function('require', 'module', 'exports', source);
  const mockModule = { exports: {} };
  sandbox(sandboxRequire, mockModule, mockModule.exports);

  // The router's handler is now available. We can call it with mock requests.
  const handler = mockModule.exports._handler || mockModule.exports.post;

  // Actually, the module.exports IS the router. Let's find the handler differently.
  // The file does: module.exports = router; and router has a _handler from our mock.
  const routerObj = mockModule.exports;
  const routeHandler = routerObj._handler;

  if (!routeHandler) {
    console.error('Could not extract route handler from module');
    process.exit(1);
  }

  // Now we explore the tree by calling the handler with synthetic requests
  // Starting from question 0, answer position 0
  const visited = new Set();
  const queue = [{ questionId: 0, answerPos: 0 }]; // seed: first question, first call

  // First, get the initial state by calling with question -1 (to trigger question 0)
  // Actually looking at the code: newQuestionId = currentQuestion + 1
  // So to get question 0's data, we'd need currentQuestion = -1... but that's question 0 index 0.
  // Let me look at the logic again.
  //
  // The handler receives body.question.id (currentQuestion) and body.answer.value (currentAnswer)
  // It computes newQuestionId = currentQuestion + 1
  // Then applies transition overrides
  // Then looks up questions[newQuestionId][newQuestionId][currentAnswer]
  //
  // So the "first call" from the frontend would be with the starting state.
  // Looking at the frontend, the first question is shown from the tree data,
  // then when user answers, body = { question: { id: 0 }, answer: { value: positionOfAnswer } }
  // This gives newQuestionId = 1, and looks up questions[1][1][positionOfAnswer]

  // Let's explore exhaustively
  function callHandler(questionId, answerValue) {
    const key = `${questionId}:${answerValue}`;
    if (visited.has(key)) return null;
    visited.add(key);

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

    try {
      routeHandler(req, res);
    } catch (e) {
      return null;
    }
    return response;
  }

  // Build a comprehensive exploration
  // The question groups go from 0 to ~18, answers from 0 to ~17
  const allResponses = [];

  for (let q = 0; q <= 20; q++) {
    for (let a = 0; a <= 20; a++) {
      const resp = callHandler(q, a);
      if (resp && resp.success) {
        allResponses.push({ fromQuestion: q, fromAnswer: a, response: resp });
      }
    }
  }

  // Now build the tree structure from the responses
  // First, collect all unique questions we've seen
  const questionNodes = new Map();
  const resultNodes = new Map();

  for (const { fromQuestion, fromAnswer, response } of allResponses) {
    if (response.endpoint && response.value) {
      // This is a terminal result
      const resultKey =
        typeof response.value === 'string' ? response.value : JSON.stringify(response.value);
      resultNodes.set(`${fromQuestion}:${fromAnswer}`, resultKey);
    } else if (response.new_question) {
      const nodeId = `${response.new_question.id}`;
      if (!questionNodes.has(nodeId)) {
        questionNodes.set(nodeId, {
          questionText: response.new_question.question,
          answers: response.new_answers,
          helpText: response.helpText || null,
          questionsLeft: response.questionsLeft,
        });
      }
    }
  }

  return { allResponses, questionNodes, resultNodes };
}

const { allResponses, questionNodes, resultNodes } = extractTree(fileContent, state);

// Build the final JSON structure
const treeJson = {
  state,
  version: '1.0.0',
  extractedFrom: 'questionnaire-api/states/' + state + '.js',
  extractedAt: new Date().toISOString(),
  nodes: {},
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
  transitions: [],
};

// Add nodes from our exploration
for (const [nodeId, data] of questionNodes) {
  treeJson.nodes[nodeId] = {
    question: data.questionText,
    help: data.helpText || null,
    answers: data.answers || [],
    questionsLeft: data.questionsLeft,
  };
}

// Add transition edges from responses
for (const { fromQuestion, fromAnswer, response } of allResponses) {
  if (response.endpoint && response.value) {
    treeJson.transitions.push({
      from: { questionId: fromQuestion, answerPosition: fromAnswer },
      to: { type: 'result', value: response.value },
    });
  } else if (response.new_question) {
    treeJson.transitions.push({
      from: { questionId: fromQuestion, answerPosition: fromAnswer },
      to: {
        type: 'question',
        questionId: response.new_question.id,
        question: response.new_question.question,
      },
    });
  }
}

const outputPath = join(OUTPUT_DIR, `${state}.json`);
writeFileSync(outputPath, JSON.stringify(treeJson, null, 2));
console.log(
  `✓ Extracted ${state} tree: ${Object.keys(treeJson.nodes).length} nodes, ${treeJson.transitions.length} transitions`,
);
console.log(`  Output: ${outputPath}`);
