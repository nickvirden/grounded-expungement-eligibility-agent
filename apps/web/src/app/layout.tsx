import type { Metadata, Viewport } from 'next';
import './globals.css';
import StyledComponentsRegistry from '@/lib/registry';
import { MainContent, PageWrapper, SkipLink } from './layout.styles';

export const metadata: Metadata = {
  title: {
    default: 'WipeRecord Eligibility — AI-Powered Record Relief',
    template: '%s | WipeRecord',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StyledComponentsRegistry>
          <SkipLink href="#main-content">Skip to main content</SkipLink>
          <PageWrapper>
            <MainContent id="main-content">{children}</MainContent>
          </PageWrapper>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
