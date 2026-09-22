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
export default function StyledComponentsRegistry({ children }: { children: React.ReactNode }) {
  const [sheet] = useState(() => new ServerStyleSheet());

  useServerInsertedHTML(() => {
    const styles = sheet.getStyleElement();
    sheet.instance.clearTag();
    return <>{styles}</>;
  });

  if (typeof window !== 'undefined') {
    return <>{children}</>;
  }

  return <StyleSheetManager sheet={sheet.instance}>{children}</StyleSheetManager>;
}
