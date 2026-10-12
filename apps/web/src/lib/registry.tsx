'use client';

import { useServerInsertedHTML } from 'next/navigation';
import { useState } from 'react';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';

/**
 * Flushes styled-components critical CSS into the initial HTML response
 * (App Router SSR registry pattern).
 *
 * Must wrap children in the root layout. On the client it is a transparent
 * pass-through; on the server it collects and injects the style tags so
 * styled-components works without a flash of unstyled content.
 */
export default function StyledComponentsRegistry({
  children,
  nonce,
}: {
  children: React.ReactNode;
  /** Per-request CSP nonce stamped onto every server-rendered style tag. */
  nonce?: string;
}) {
  const [sheet] = useState(() => new ServerStyleSheet({ nonce }));

  useServerInsertedHTML(() => {
    const styles = sheet.getStyleElement();
    sheet.instance.clearTag();
    return <>{styles}</>;
  });

  if (typeof window !== 'undefined') {
    return <>{children}</>;
  }

  return (
    <StyleSheetManager sheet={sheet.instance} nonce={nonce}>
      {children}
    </StyleSheetManager>
  );
}
