import {
  PrimaryAction,
  StatusBody,
  StatusCard,
  StatusEyebrow,
  StatusHeadline,
  StatusShell,
} from '@/components/StatusCard.styles';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Page not found' };

/**
 * Replaces Next's built-in 404 page, which inlines a style element and
 * inline style attributes. The nonce-only `style-src` blocks both, leaving the
 * page unstyled and the console full of CSP violations. This page is built only from
 * styled-components, which the root layout's registry renders with the nonce.
 *
 * It renders inside the layout's `<main>` landmark, so it must not add its own.
 */
export default function NotFound() {
  return (
    <StatusShell>
      <StatusCard aria-labelledby="not-found-heading">
        <StatusEyebrow>Error 404</StatusEyebrow>
        <StatusHeadline id="not-found-heading">Page not found</StatusHeadline>
        <StatusBody>
          We could not find that page. Check the address, or start again from the home page.
        </StatusBody>
        <PrimaryAction as={Link} href="/">
          Go to the home page
        </PrimaryAction>
      </StatusCard>
    </StatusShell>
  );
}
