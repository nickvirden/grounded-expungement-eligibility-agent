'use client';

import {
  PrimaryAction,
  SecondaryAction,
  StatusActions,
  StatusBody,
  StatusCard,
  StatusEyebrow,
  StatusHeadline,
  StatusShell,
} from '@/components/StatusCard.styles';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';

/**
 * Route-level error boundary. Unlike Next's built-in error UI, it is built only from
 * styled-components, so it carries no inline styles. For a server-render failure the
 * server sends the `__next_error__` shell with an empty `<head>`, and the browser then
 * renders the layout and this page; its style tags take their nonce from
 * `instrumentation-client.ts` (or the `csp-nonce` meta tag once the layout has rendered).
 * It renders inside the layout's `<main>` landmark, so it must not add its own.
 *
 * Neither `error.message` nor `digest` is rendered: server error text can carry
 * internals and the page is shown to anyone who hits the failure.
 *
 * Errors in the root layout itself bypass this boundary; see global-error.tsx.
 */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Replacing the page content drops keyboard and screen reader focus; moving it to the
  // heading announces the new state. A live region (role="alert") would announce twice.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // `reset()` alone re-renders with the cached server result, so the server components
  // must be refreshed too. Retrying is always the user's choice: an automatic retry
  // against a struggling API would loop.
  const retry = () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <StatusShell>
      <title>Something went wrong | ClearSlate</title>
      <StatusCard aria-labelledby="error-heading">
        <StatusEyebrow>Error</StatusEyebrow>
        <StatusHeadline id="error-heading" ref={headingRef} tabIndex={-1}>
          Something went wrong
        </StatusHeadline>
        <StatusBody>
          We could not load this page. Try again, or start again from the home page.
        </StatusBody>
        <StatusActions>
          <PrimaryAction as="button" type="button" onClick={retry} disabled={isPending}>
            Try again
          </PrimaryAction>
          <SecondaryAction as={Link} href="/">
            Go to the home page
          </SecondaryAction>
        </StatusActions>
      </StatusCard>
    </StatusShell>
  );
}
