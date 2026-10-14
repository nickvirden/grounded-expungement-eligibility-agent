import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * Reads the committed Texas tree and reaches any node through the real UI.
 *
 * The tree file is read with `fs` (no network), and every step clicks the real answer button by
 * index, so the page walks the same rule engine a person does. Answers are clicked by index
 * because two answers in one question can share a position.
 */

interface TreeNode {
  group: number;
  question: string;
  help: string | null;
  answers: Array<{ value: string; position: number }>;
}

interface Tree {
  entryNodeId: string;
  nodes: Record<string, TreeNode>;
  transitions: Array<{
    from: { questionId: number; answerPosition: number };
    to: { type: string; nodeId?: string };
  }>;
}

const REPO_ROOT = join(__dirname, '..');

export const loadTree = (state = 'texas'): Tree =>
  JSON.parse(readFileSync(join(REPO_ROOT, 'packages/shared/state-trees', `${state}.json`), 'utf8'));

/** For each reachable node, the answer indexes to click from the entry question. */
export function answerPaths(tree: Tree): Record<string, number[]> {
  const nextOf = (node: TreeNode, position: number): string | null => {
    const t = tree.transitions.find(
      (x) => x.from.questionId === node.group && x.from.answerPosition === position,
    );
    return t?.to.type === 'question' && t.to.nodeId ? t.to.nodeId : null;
  };
  const paths: Record<string, number[]> = { [tree.entryNodeId]: [] };
  const queue = [tree.entryNodeId];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const node = tree.nodes[id];
    if (!node) continue;
    node.answers.forEach((answer, index) => {
      const to = nextOf(node, answer.position);
      if (to && !(to in paths)) {
        paths[to] = [...(paths[id] ?? []), index];
        queue.push(to);
      }
    });
  }
  return paths;
}

const tree = loadTree();
const paths = answerPaths(tree);

export const nodeHasHelp = (id: string): boolean => Boolean(tree.nodes[id]?.help?.trim());

/** Opens the Quick Form and clicks through to the node. */
export async function gotoNode(page: Page, id: string): Promise<void> {
  const path = paths[id];
  if (!path) throw new Error(`Node ${id} is not reachable in the Texas tree`);
  await page.goto('/intake/texas/quick');
  await page.locator('h2').first().waitFor({ timeout: 10_000 });
  for (const index of path) {
    const before = await page.locator('h2').first().textContent();
    await page.locator('button[aria-pressed]').nth(index).click();
    await page.waitForFunction(
      (prev) => document.querySelector('h2')?.textContent !== prev,
      before,
      { timeout: 15_000 },
    );
    // The next question's answers replace the loading row in the same render as its text.
    await page.locator('button[aria-pressed]:enabled').first().waitFor({ timeout: 15_000 });
  }
}
