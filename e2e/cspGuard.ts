import { test as base, expect } from '@playwright/test';

/**
 * `test` with an automatic guard that fails any test during which the browser
 * reported a `securitypolicyviolation`. Violations are forwarded to Node as
 * they happen so they survive page navigations.
 */
export const test = base.extend<{ cspGuard: undefined }>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: string[] = [];
      await page.exposeFunction('__reportCspViolation', (detail: string) => {
        violations.push(detail);
      });
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          (window as unknown as { __reportCspViolation: (d: string) => void }).__reportCspViolation(
            `${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`,
          );
        });
      });
      await use();
      expect(violations, 'CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
