/**
 * Tag for specs that also run in Firefox and WebKit (see playwright.config.ts). Apply it to
 * a `test.describe` that exercises engine-specific behaviour: dialog and focus handling,
 * viewport units, forced colors, pointer and touch input.
 */
export const CROSS_BROWSER = '@cross-browser';

/** Selects the tagged specs; the tag is plain text, so it needs no escaping in a regex. */
export const CROSS_BROWSER_GREP = new RegExp(CROSS_BROWSER);
