// Prints the review sheet and ledger hashes for one help rule, so an entry can be added to
// src/lib/helpRuleLedger.json deliberately, after a person has read the rule.
//   pnpm --filter web help:review texas 11-11
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatReviewSheet } from '../src/lib/helpRuleLedger';

const [state, nodeId] = process.argv.slice(2);
if (!state || !nodeId) {
  console.error('usage: pnpm --filter web help:review <state> <nodeId>');
  process.exit(1);
}

const treePath = join(import.meta.dirname, '../../../packages/shared/state-trees', `${state}.json`);
if (!existsSync(treePath)) {
  console.error(`No state tree for ${state}.`);
  process.exit(1);
}
const tree = JSON.parse(readFileSync(treePath, 'utf8')) as {
  nodes: Record<
    string,
    { question: string; help: string | null; answers: Array<{ value: string }> }
  >;
};
if (!Object.hasOwn(tree.nodes, nodeId)) {
  console.error(`No node ${nodeId} in the ${state} tree.`);
  process.exit(1);
}
console.log(formatReviewSheet(state, nodeId, tree.nodes));
