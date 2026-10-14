import { DomUtils, parseDocument } from 'htmlparser2';
import { type HelpBlock, type StatuteItem, transformHelp } from './helpTransform';

// A plain-text outline of a help string with its structure visible, for the human reviewing a
// rule: one title line, one paragraph per block, one list item per line with its marker, nested
// items indented and statute labels shown. It is built from the same transform the app renders
// with, so the reviewer reads what a user would see.

type Node = ReturnType<typeof parseDocument>['children'][number];

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const indent = (depth: number) => '  '.repeat(depth);

function listLines(list: Node, depth: number): string[] {
  if (!DomUtils.isTag(list)) return [];
  const ordered = list.name === 'ol';
  const lines: string[] = [];
  let n = 0;
  for (const li of list.children) {
    if (!DomUtils.isTag(li) || li.name !== 'li') continue;
    n += 1;
    const own = li.children.filter((c) => !(DomUtils.isTag(c) && /^[uo]l$/.test(c.name)));
    lines.push(`${indent(depth)}${ordered ? `${n}.` : '-'} ${squash(DomUtils.textContent(own))}`);
    for (const nested of li.children) {
      if (DomUtils.isTag(nested) && /^[uo]l$/.test(nested.name)) {
        lines.push(...listLines(nested, depth + 1));
      }
    }
  }
  return lines;
}

/** Each paragraph, heading or list is one group of lines. */
function htmlGroups(html: string): string[][] {
  const groups: string[][] = [];
  for (const node of parseDocument(html).children) {
    if (!DomUtils.isTag(node)) continue;
    if (node.name === 'ul' || node.name === 'ol') {
      groups.push(listLines(node, 0));
    } else {
      const t = squash(DomUtils.textContent(node));
      if (t) groups.push([/^h[34]$/.test(node.name) ? `## ${t}` : t]);
    }
  }
  return groups;
}

function statuteLines(items: StatuteItem[], depth: number): string[] {
  return items.flatMap((i) => [
    `${indent(depth)}${i.label} ${squash(DomUtils.textContent(parseDocument(i.html).children))}`,
    ...statuteLines(i.children, depth + 1),
  ]);
}

function blockGroups(b: HelpBlock): string[][] {
  if (b.kind === 'html') return htmlGroups(b.html);
  if (b.kind === 'statuteList') return [statuteLines(b.items, 0)];
  return [b.items.map((i) => `- ${i}`)];
}

/**
 * The help text as an outline, separated by blank lines. The rule sentence, when the help has
 * exactly one, appears first as an ordinary paragraph.
 */
export function outlineHelp(help: string): string {
  const content = transformHelp(help, { directiveGate: 'single-rule' });
  const groups: string[][] = [];
  if (content.title) groups.push([`Title: ${content.title}`]);
  if (content.directive) groups.push([content.directive]);
  for (const b of content.blocks) groups.push(...blockGroups(b));
  return groups.map((g) => g.join('\n')).join('\n\n');
}
