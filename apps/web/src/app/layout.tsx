import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import StyledComponentsRegistry from '@/lib/registry';
import { MainContent, PageWrapper, SkipLink } from './layout.styles';

export const metadata: Metadata = {
  title: {
    default: 'ClearSlate Eligibility — AI-Powered Record Relief',
    template: '%s | ClearSlate',
  },
  description:
    'Find out if your record qualifies for expungement, sealing, or other relief — guided by AI.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by middleware.ts; absent only when middleware does not run.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en">
      <head>
        {/* styled-components reads this for style tags it injects in the browser. */}
        {nonce && <meta property="csp-nonce" content={nonce} />}
      </head>
      <body>
        <StyledComponentsRegistry nonce={nonce}>
          <SkipLink href="#main-content">Skip to main content</SkipLink>
          <PageWrapper>
            <MainContent id="main-content">{children}</MainContent>
          </PageWrapper>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
