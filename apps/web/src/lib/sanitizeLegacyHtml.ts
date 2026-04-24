import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize legacy HTML strings coming from the API tree.
 *
 * Intentionally restrictive: allow basic formatting + lists, but no attributes
 * (links can be enabled later if needed with scheme restrictions).
 */
export function sanitizeLegacyHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'span'],
    allowedAttributes: {},
    // Preserve reasonable whitespace behavior for inline content.
    // sanitize-html already drops dangerous tags/attrs and normalizes output.
    parser: { lowerCaseTags: true },
  });
}

