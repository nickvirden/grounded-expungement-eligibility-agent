import { DomUtils, parseDocument } from 'htmlparser2';
import sanitizeHtml from 'sanitize-html';
import { sanitizeLegacyHtml } from './sanitizeLegacyHtml';

// Render-time transform for the legacy help HTML in the state trees.
//
// The trees are pinned by parity tests, so presentation cannot be fixed in the data. Every
// stage is attribute-free:
//   1. sanitize-html with HELP_INPUT_PROFILE: today's allowlist plus `h5` and `div`, so the
//      structure the transform needs (titles, sub-headings, div-wrapped lead-ins) survives.
//      Nothing from this stage reaches the DOM.
//   2. htmlparser2 parses the result (the parser sanitize-html itself uses) and the top-level
//      blocks are normalised: `div` unwrapped, orphan inline runs wrapped in `<p>`, empty
//      `<p>` dropped.
//   3. Roles are detected: title, directive, sub-headings, hand-numbered lists, statute lists
//      and index lists. Every detector is strict and falls back to plain content when unsure,
//      so text is never dropped.
//   4. Plain content is serialised and re-sanitized with HELP_OUTPUT_PROFILE (no `h5`/`div`;
//      adds attribute-free `h3`/`h4`). The title and directive are returned as plain text and
//      the special lists as data, for React to render.

// ─── Sanitizer profiles ──────────────────────────────────────────────────────

// These tag lists mirror the allowlist in sanitizeLegacyHtml, which stays the profile for
// questions, answers and the decision path.
const INLINE_TAGS = ['b', 'strong', 'i', 'em', 'u', 'span', 'br'];
const LEGACY_TAGS = ['p', ...INLINE_TAGS, 'ul', 'ol', 'li'];

/** Transform input only: today's allowlist plus the two structural tags the data uses. */
const HELP_INPUT_PROFILE: sanitizeHtml.IOptions = {
  allowedTags: [...LEGACY_TAGS, 'h5', 'div'],
  allowedAttributes: {},
  parser: { lowerCaseTags: true },
};

/** What can reach `dangerouslySetInnerHTML`. `h3`/`h4` are the only additions. */
const HELP_OUTPUT_PROFILE: sanitizeHtml.IOptions = {
  allowedTags: [...LEGACY_TAGS, 'h3', 'h4'],
  allowedAttributes: {},
  parser: { lowerCaseTags: true },
};

/** Statute item text, rendered inside a React-owned `<li>`. */
const INLINE_PROFILE: sanitizeHtml.IOptions = {
  allowedTags: INLINE_TAGS,
  allowedAttributes: {},
  parser: { lowerCaseTags: true },
};

// ─── Output types ────────────────────────────────────────────────────────────

/**
 * Decoded text: it may contain `<` and `&` characters that came from entities in the source, so
 * it is safe only as a React text child and unsafe as markup. The brand records that at the type
 * level. It cannot stop a `string`-typed `__html` from accepting the value, so the rule is
 * enforced by review: only the transform creates a `PlainText`, and nothing passes one to
 * `dangerouslySetInnerHTML`.
 */
export type PlainText = string & { readonly __plainText: true };
const asPlainText = (s: string): PlainText => s as PlainText;

export interface StatuteItem {
  /** Statutory label exactly as written, for example "(a)" or "(1)". Render as a text node. */
  label: PlainText;
  /** Sanitized, attribute-free inline HTML of the item text with the label removed. */
  html: string;
  children: StatuteItem[];
}

export type HelpBlock =
  /** Sanitized, attribute-free HTML (paragraphs, lists, `h3`/`h4` sub-headings). */
  | { kind: 'html'; html: string }
  /** A long list of short entries (the 84 counties); React renders the list as text nodes. */
  | { kind: 'indexList'; items: PlainText[] }
  /** A quoted statute with its own (a)/(1) labels; React renders the labels as elements. */
  | { kind: 'statuteList'; items: StatuteItem[] };

export interface HelpContent {
  /**
   * Decoded plain text, for example `<script>x</script>` for the source
   * `&lt;script&gt;x&lt;/script&gt;`. Render it only as a React text node. Passing it through
   * `innerHTML` would turn data into markup.
   */
  title: PlainText | null;
  /**
   * The decoded plain text of the single "Answer YES/NO ..." sentence. Render it only as a
   * React text node, never through `innerHTML`.
   */
  directive: PlainText | null;
  blocks: HelpBlock[];
}

/**
 * - `'single-rule'`: the first body paragraph is returned as the directive when it is a
 *   bold-only "answer yes/no" sentence and the help contains exactly one such sentence anywhere.
 * - `'never'`: nothing is promoted; the sentence stays as ordinary bold text in the body.
 */
export type DirectiveGate = 'single-rule' | 'never';

export interface TransformOptions {
  /** Heading level for later `<h5>` sub-headings such as "Examples:". Defaults to 3. */
  subheadingLevel?: 3 | 4;
  /** Defaults to `'never'`, so promotion is always an explicit decision. */
  directiveGate?: DirectiveGate;
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

// Types are derived from htmlparser2's own exports so domhandler need not be a direct dependency.
type DomNode = ReturnType<typeof parseDocument>['children'][number];
type DomElement = ReturnType<typeof DomUtils.getElementsByTagName>[number];

const isTag = (n: DomNode | undefined, ...names: string[]): n is DomElement =>
  n !== undefined && DomUtils.isTag(n) && (names.length === 0 || names.includes(n.name));
const isText = (n: DomNode | undefined): n is DomNode & { data: string } =>
  n !== undefined && DomUtils.isText(n);
const text = (n: DomNode | DomNode[]): string => DomUtils.textContent(n);
const ws = (s: string) => s.replace(/\s+/g, ' ').trim();
const isBlank = (n: DomNode) => (isText(n) && ws(n.data) === '') || DomUtils.isComment(n);
const meaningful = (nodes: DomNode[]) => nodes.filter((n) => !isBlank(n));
const html = (nodes: DomNode[]) => nodes.map((n) => DomUtils.getOuterHTML(n)).join('');
const inner = (n: DomElement) => html(n.children);
const words = (s: string) => ws(s).split(' ').filter(Boolean).length;
// Annotated `boolean`: an inferred type predicate would narrow every element out of the
// non-inline branches of toBlocks.
const isInline = (n: DomNode): boolean => isText(n) || isTag(n, ...INLINE_TAGS);
const textOnly = (n: DomElement) => n.children.every((c) => isText(c));
const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** An element whose chain of single children matches the given tag sets, ending in text only. */
function singleChain(nodes: DomNode[], levels: string[][]): DomElement | null {
  let current = meaningful(nodes);
  let last: DomElement | null = null;
  for (const allowed of levels) {
    const only = current[0];
    if (current.length !== 1 || !isTag(only, ...allowed)) return null;
    last = only;
    current = meaningful(only.children);
  }
  return last && textOnly(last) && ws(text(last)) ? last : null;
}

// ─── Stage 2: block normalisation ────────────────────────────────────────────

type Block =
  | { type: 'p'; nodes: DomNode[] }
  | { type: 'heading'; el: DomElement }
  | { type: 'list'; el: DomElement };

function flattenDivs(nodes: DomNode[]): DomNode[] {
  return nodes.flatMap((n) => (isTag(n, 'div') ? flattenDivs(n.children) : [n]));
}

function toBlocks(nodes: DomNode[]): Block[] {
  const blocks: Block[] = [];
  let run: DomNode[] = [];
  const flush = () => {
    if (ws(text(run))) blocks.push({ type: 'p', nodes: run });
    run = [];
  };
  for (const n of flattenDivs(nodes)) {
    if (isInline(n) || DomUtils.isComment(n)) {
      run.push(n);
      continue;
    }
    flush();
    if (isTag(n, 'p')) {
      if (n.children.every((c) => isInline(c) || DomUtils.isComment(c))) {
        // Empty paragraphs (including the fallout of `<p><ul>…</ul></p>`) are dropped.
        if (ws(text(n))) blocks.push({ type: 'p', nodes: n.children });
      } else {
        // The parser normally closes a `<p>` before a block child; if it did not, the block
        // children are lifted out so a list or heading is never trapped inside a paragraph.
        blocks.push(...toBlocks(n.children));
      }
    } else if (isTag(n, 'h5')) {
      if (ws(text(n))) blocks.push({ type: 'heading', el: n });
    } else if (isTag(n, 'ul', 'ol')) {
      blocks.push({ type: 'list', el: n });
    } else {
      // Anything else that survives sanitizing (in practice an orphan `li`) keeps its content
      // as blocks of its own; getChildren is empty for nodes that carry no text.
      blocks.push(...toBlocks(DomUtils.getChildren(n)));
    }
  }
  flush();
  return blocks;
}

// ─── Stage 3: role detection ─────────────────────────────────────────────────

const ANSWER_RULE = /\banswer\s+(yes|no)\b/gi;
const STATUTE_LABEL = /^\s*(\((?:[a-z]|[0-9]+|[ivxlc]+)\))\s+/i;
const HAND_NUMBER = /^\s*(\d+)\.\s+/;
const INDEX_MIN_ITEMS = 25;
const INDEX_MAX_WORDS = 3;

// Text nodes joined with spaces: textContent alone glues block boundaries together
// ("…Offenses</h5><p>Answer YES" becomes "OffensesAnswer YES"), which defeats the \b in
// ANSWER_RULE.
const spacedText = (nodes: DomNode[]) =>
  ws(
    DomUtils.filter((n) => isText(n), nodes, true)
      .map((n) => (isText(n) ? n.data : ''))
      .join(' '),
  );

/**
 * Decoded plain text of legacy HTML, as a person reads it: markup removed, `script`/`style`
 * content dropped, text nodes separated by a space.
 */
export const plainText = (htmlish: string): PlainText =>
  asPlainText(spacedText(parseDocument(sanitizeHtml(htmlish, HELP_INPUT_PROFILE)).children));

const hasRulePhrase = (s: string) => new RegExp(ANSWER_RULE.source, 'i').test(s);

/** How many "answer yes/no" phrases the help contains anywhere. */
export const countAnswerRules = (helpHtml: string): number =>
  (plainText(helpHtml).match(ANSWER_RULE) ?? []).length;

function titleOf(block: Block | undefined): PlainText | null {
  if (!block) return null;
  if (block.type === 'heading') {
    // <h5>T</h5>, <h5><u>T</u></h5>, <h5><b><u>T</u></b></h5>: inline-only and non-empty.
    const inlineOnly = DomUtils.getElementsByTagName(() => true, block.el.children, true).every(
      (el) => isTag(el, 'u', 'b', 'strong', 'i', 'em', 'span'),
    );
    return inlineOnly ? titleText(block.el) : null;
  }
  if (block.type === 'p') {
    // <p><b><u>T</u></b></p> or <p><u><b>T</b></u></p>. The underline is required: a
    // bold-only paragraph is a directive or lead-in candidate, never a title.
    const el =
      singleChain(block.nodes, [['b', 'strong'], ['u']]) ??
      singleChain(block.nodes, [['u'], ['b', 'strong']]);
    return el ? titleText(el) : null;
  }
  return null;
}

/**
 * A title is shown on an always-visible button, so a block that states the answer rule is
 * never used as one; it stays in the body, where the rule gate can see it.
 */
function titleText(el: DomElement): PlainText | null {
  const t = ws(text(el));
  return t && !hasRulePhrase(t) ? asPlainText(t) : null;
}

/** A bold-only paragraph whose text-only bold run says "answer yes/no". */
function directiveCandidate(block: Block): PlainText | null {
  if (block.type !== 'p') return null;
  const el = singleChain(block.nodes, [['b', 'strong']]);
  if (!el) return null;
  const t = ws(text(el));
  return hasRulePhrase(t) ? asPlainText(t) : null;
}

/**
 * The item's children with the leading `pattern` removed from its first text node, serialised.
 * Null when the first meaningful node is not a text node that starts with the pattern, so a
 * marker hidden inside an element is never half-removed.
 */
function stripLeading(nodes: DomNode[], pattern: RegExp): string | null {
  const first = meaningful(nodes)[0];
  if (!isText(first) || !pattern.test(first.data)) return null;
  const rest = nodes.slice(nodes.indexOf(first) + 1);
  return escapeText(first.data.replace(pattern, '')) + html(rest);
}

const listItems = (list: DomElement) => list.children.filter((c) => isTag(c, 'li'));

/** Every child of the list is an `li` (whitespace aside), so rebuilding it drops nothing. */
const onlyItems = (list: DomElement) => meaningful(list.children).every((c) => isTag(c, 'li'));

function handNumbered(list: DomElement): boolean {
  const items = listItems(list);
  if (items.length < 2 || !onlyItems(list)) return false;
  return items.every((li, i) => {
    const m = HAND_NUMBER.exec(text(li));
    // The marker must be removable, otherwise the list would keep a double marker.
    return m !== null && Number(m[1]) === i + 1 && stripLeading(li.children, HAND_NUMBER) !== null;
  });
}

function statuteItems(list: DomElement): StatuteItem[] | null {
  const items = meaningful(list.children);
  if (items.length === 0) return null;
  const out: StatuteItem[] = [];
  for (const li of items) {
    if (!isTag(li, 'li')) return null;
    const nestedIdx = li.children.findIndex((k) => isTag(k, 'ul', 'ol'));
    const nested = nestedIdx === -1 ? undefined : li.children[nestedIdx];
    // A nested list is only understood as the item's last child; anything else falls back.
    if (nested !== undefined && meaningful(li.children.slice(nestedIdx + 1)).length > 0) {
      return null;
    }
    // Slicing the raw children (not the meaningful ones) keeps whitespace between inline nodes.
    const own = nestedIdx === -1 ? li.children : li.children.slice(0, nestedIdx);
    if (!own.every((c) => isInline(c) || DomUtils.isComment(c))) return null;
    const m = STATUTE_LABEL.exec(text(own));
    const body = stripLeading(own, STATUTE_LABEL);
    if (!m || m[1] === undefined || body === null) return null;
    let children: StatuteItem[] = [];
    if (isTag(nested)) {
      const sub = statuteItems(nested);
      if (!sub) return null;
      children = sub;
    }
    out.push({ label: asPlainText(m[1]), html: sanitizeHtml(body, INLINE_PROFILE), children });
  }
  return out;
}

function indexItems(list: DomElement): PlainText[] | null {
  if (!isTag(list, 'ul')) return null;
  const items = meaningful(list.children);
  if (items.length < INDEX_MIN_ITEMS) return null;
  if (!items.every((li) => isTag(li, 'li') && textOnly(li))) return null;
  const texts = items.map((li) => ws(text(li)));
  return texts.every((t) => t && words(t) <= INDEX_MAX_WORDS) ? texts.map(asPlainText) : null;
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Splits a legacy help string into a title, an optional directive and renderable blocks.
 * Never drops text. On any exception it returns exactly today's legacy rendering with nothing
 * promoted, so a malformed string degrades to what the app already shows.
 */
export function transformHelp(raw: string, options: TransformOptions = {}): HelpContent {
  try {
    return transform(raw, options);
  } catch {
    return {
      title: null,
      directive: null,
      blocks: [{ kind: 'html', html: sanitizeLegacyHtml(raw) }],
    };
  }
}

function transform(raw: string, options: TransformOptions): HelpContent {
  const { subheadingLevel = 3, directiveGate = 'never' } = options;
  const doc = parseDocument(sanitizeHtml(raw, HELP_INPUT_PROFILE));
  const blocks = toBlocks(doc.children);

  // Title: only ever the first block.
  const title = titleOf(blocks[0]);
  if (title !== null) blocks.shift();

  // Directive: only the first body block, only if it is a bold-only "answer yes/no" paragraph,
  // and only if the help has no other "answer yes/no" phrase anywhere. A second phrase means the
  // help is ambiguous, so nothing is promoted.
  let directive: PlainText | null = null;
  if (directiveGate === 'single-rule') {
    const first = blocks[0] ? directiveCandidate(blocks[0]) : null;
    const ruleCount = (spacedText(doc.children).match(ANSWER_RULE) ?? []).length;
    if (first !== null && ruleCount === 1) {
      directive = first;
      blocks.shift();
    }
  }

  const out: HelpBlock[] = [];
  let pending = '';
  const flushHtml = () => {
    if (pending) out.push({ kind: 'html', html: sanitizeHtml(pending, HELP_OUTPUT_PROFILE) });
    pending = '';
  };

  for (const block of blocks) {
    if (block.type === 'p') {
      pending += `<p>${html(block.nodes)}</p>`;
    } else if (block.type === 'heading') {
      pending += `<h${subheadingLevel}>${inner(block.el)}</h${subheadingLevel}>`;
    } else if (block.type === 'list') {
      const el = block.el;
      const statute = statuteItems(el);
      const index = statute ? null : indexItems(el);
      if (statute) {
        flushHtml();
        out.push({ kind: 'statuteList', items: statute });
      } else if (index) {
        flushHtml();
        out.push({ kind: 'indexList', items: index });
      } else if (handNumbered(el)) {
        const items = listItems(el).map(
          (li) => `<li>${stripLeading(li.children, HAND_NUMBER) ?? inner(li)}</li>`,
        );
        pending += `<ol>${items.join('')}</ol>`;
      } else {
        pending += DomUtils.getOuterHTML(el);
      }
    }
  }
  flushHtml();

  return { title, directive, blocks: out };
}
