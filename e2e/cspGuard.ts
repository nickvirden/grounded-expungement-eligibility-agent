import { test as base, expect } from '@playwright/test';

/**
 * `test` with an automatic guard that fails any test during which the browser
 * reported a `securitypolicyviolation`.
 *
 * Violations are recorded twice. Forwarding to Node (`exposeFunction`) keeps
 * them across navigations, but delivery is asynchronous, so a violation caused
 * by a test's final action can arrive after teardown has asserted. The
 * in-page `window.__cspViolations` list is written synchronously by the same
 * listener and is read back at teardown to close that gap.
 */
export const test = base.extend<{ cspGuard: undefined }>({
  cspGuard: [
    async ({ page }, use) => {
      const forwarded: string[] = [];
      await page.exposeFunction('__reportCspViolation', (detail: string) => {
        forwarded.push(detail);
      });
      await page.addInitScript(() => {
        const w = window as unknown as {
          __cspViolations: string[];
          __reportCspViolation: (d: string) => void;
        };
        w.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (e) => {
          const detail = `${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`;
          w.__cspViolations.push(detail);
          w.__reportCspViolation(detail);
        });
      });
      await use();

      // The page may be closed or mid-navigation by teardown; the forwarded
      // list still covers whatever arrived before then.
      let inPage: string[] = [];
      if (!page.isClosed()) {
        try {
          inPage = await page.evaluate(
            () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
          );
        } catch {
          inPage = [];
        }
      }
      // A violation on the current document appears in both lists; the
      // forwarded list adds ones from documents that have since navigated away.
      const violations = [...new Set([...forwarded, ...inPage])];
      expect(violations, 'CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
