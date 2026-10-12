export type WebMode = 'dev' | 'production';

function parseWebMode(raw: string | undefined): WebMode {
  if (raw === undefined || raw === '' || raw === 'dev') return 'dev';
  if (raw === 'production') return 'production';
  throw new Error(`E2E_WEB_MODE must be 'dev' or 'production', got '${raw}'`);
}

/** Which web server the suite runs against; production serves the standalone build. */
export const webMode: WebMode = parseWebMode(process.env.E2E_WEB_MODE);
