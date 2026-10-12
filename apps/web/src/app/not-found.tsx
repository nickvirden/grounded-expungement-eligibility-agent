import type { Metadata } from 'next';
import Link from 'next/link';
import {
  HomeLink,
  NotFoundBody,
  NotFoundCard,
  NotFoundHeadline,
  NotFoundShell,
  StatusEyebrow,
} from './not-found.styles';

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
    <NotFoundShell>
      <NotFoundCard aria-labelledby="not-found-heading">
        <StatusEyebrow>Error 404</StatusEyebrow>
        <NotFoundHeadline id="not-found-heading">Page not found</NotFoundHeadline>
        <NotFoundBody>
          We could not find that page. Check the address, or start again from the home page.
        </NotFoundBody>
        <HomeLink as={Link} href="/">
          Go to the home page
        </HomeLink>
      </NotFoundCard>
    </NotFoundShell>
  );
}
