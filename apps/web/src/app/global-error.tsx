'use client';

import { useEffect, useRef } from 'react';
import './globals.css';
import styles from './global-error.module.css';

/**
 * Last-resort boundary for errors thrown by the root layout, which `error.tsx` cannot
 * catch. It replaces the root layout, so there is no styled-components registry to
 * server-render styles, and styled-components would depend on the client-side nonce
 * fallback (`instrumentation-client.ts`) for every style tag. It is therefore plain CSS:
 * the stylesheets are same-origin `<link>`s, which `style-src 'self'` allows without a
 * nonce. Do not add inline styles or styled-components to this file.
 *
 * Retry reloads the document: the layout failed, so there is no healthy tree to
 * re-render in place. `error.message` and `digest` are never rendered.
 */
export default function GlobalError() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <html lang="en">
      <head>
        <title>Something went wrong | ClearSlate</title>
      </head>
      <body>
        <main className={styles.shell}>
          <section className={styles.card} aria-labelledby="error-heading">
            <p className={styles.eyebrow}>Error</p>
            <h1 id="error-heading" className={styles.headline} ref={headingRef} tabIndex={-1}>
              Something went wrong
            </h1>
            <p className={styles.body}>
              We could not load this page. Try again, or start again from the home page.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
              {/* A plain anchor: next/link needs the router context the layout failure may have lost. */}
              <a className={styles.secondary} href="/">
                Go to the home page
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
