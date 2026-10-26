/**
 * GitHub REST transport for the triage workflow. This is the only file that
 * calls `fetch`, and every non-GET request goes through the single `write()`
 * below, which checks the allowlist and refuses outright in dry-run mode.
 *
 * Plain `fetch` rather than the `gh` CLI keeps issue-derived values out of any
 * shell: the only values interpolated into a path are validated integers.
 */
import { assertAllowedWrite } from './allowed_writes.mjs';

const MAX_PAGES = 50;
const MIN_RATE_LIMIT_REMAINING = 50;
const REQUEST_TIMEOUT_MS = 30_000;
const DIGEST_LABEL = 'triage-digest';
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function assertIssueNumber(number) {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error('invalid issue number');
  }
  return number;
}

function nextLink(header) {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

/**
 * @param {{
 *   token: string,
 *   repo: string,
 *   dryRun: boolean,
 *   apiUrl?: string,
 *   fetchImpl?: typeof fetch,
 * }} options
 */
export function createGitHub({
  token,
  repo,
  dryRun,
  apiUrl = 'https://api.github.com',
  fetchImpl = globalThis.fetch,
}) {
  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!REPO_PATTERN.test(repo ?? '')) throw new Error('GITHUB_REPOSITORY is not owner/name');
  const base = new URL(apiUrl);
  let digestNumber;
  let lastRemaining = null;

  async function request(method, url, body, { skipRateCheck = false } = {}) {
    // Checked before sending, never after a response: a write GitHub already accepted
    // must still be recorded and reported. The reporting writes are exempt so a
    // label that was applied always reaches the digest.
    if (!skipRateCheck && lastRemaining !== null && lastRemaining < MIN_RATE_LIMIT_REMAINING) {
      throw new Error(`GitHub rate limit nearly exhausted (${lastRemaining} left); stopping`);
    }
    const response = await fetchImpl(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'expungement-triage',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // A redirect would carry the token to wherever it points.
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // Rate limiting is a stop, not a retry: the weekly pass picks up what was missed.
    if (response.status === 403 || response.status === 429) {
      throw new Error(`GitHub refused the request (${response.status}); stopping`);
    }
    if (!response.ok) {
      throw new Error(`GitHub request failed (${response.status})`);
    }
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining !== null) lastRemaining = Number(remaining);
    return response;
  }

  async function get(path) {
    const response = await request('GET', `${base.origin}/repos/${repo}${path}`);
    return response.json();
  }

  async function getAllPages(path) {
    const items = [];
    let url = `${base.origin}/repos/${repo}${path}`;
    for (let page = 0; url; page++) {
      if (page >= MAX_PAGES) {
        throw new Error(`more than ${MAX_PAGES} pages of results; stopping`);
      }
      const response = await request('GET', url);
      items.push(...(await response.json()));
      url = nextLink(response.headers.get('link'));
      // The token must never be sent anywhere but the configured API host.
      if (url && new URL(url).origin !== base.origin) {
        throw new Error('pagination link points outside the API host');
      }
    }
    return items;
  }

  async function write(method, path, body) {
    assertAllowedWrite({ method, path, body }, { digestNumber });
    if (dryRun) {
      throw new Error(`dry run: refused ${method} ${path}`);
    }
    const response = await request(method, `${base.origin}/repos/${repo}${path}`, body, {
      skipRateCheck: !path.endsWith('/labels'),
    });
    return response.json();
  }

  return {
    /** Open issues and pull requests; callers filter. */
    listOpenIssues: () => getAllPages('/issues?state=open&per_page=100'),
    getIssue: (number) => get(`/issues/${assertIssueNumber(number)}`),
    /**
     * @returns {Promise<{ number: number, others: number[] } | null>} The lowest-numbered open
     * issue labeled `triage-digest`, and any others. Remembers it as the one issue
     * that may receive comments and body edits.
     */
    async findDigestIssue() {
      const issues = await getAllPages(`/issues?state=open&labels=${DIGEST_LABEL}&per_page=100`);
      const numbers = issues
        .filter((issue) => !issue.pull_request)
        .map((issue) => issue.number)
        .sort((a, b) => a - b);
      if (numbers.length === 0) return null;
      digestNumber = numbers[0];
      return { number: numbers[0], others: numbers.slice(1) };
    },
    addLabels: (number, labels) =>
      write('POST', `/issues/${assertIssueNumber(number)}/labels`, { labels }),
    postComment: (number, body) =>
      write('POST', `/issues/${assertIssueNumber(number)}/comments`, { body }),
    setBody: (number, body) => write('PATCH', `/issues/${assertIssueNumber(number)}`, { body }),
  };
}
