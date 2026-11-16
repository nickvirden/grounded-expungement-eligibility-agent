// Letters, digits, underscores and hyphens, starting (multi-word states are underscore-named, e.g. `new_york`), with a letter. The route segment arrives still
// percent-encoded, so rejecting `%`, `/`, `.`, `?` and `#` keeps a crafted slug from ever
// shaping the path or query of the internal API request. Case is not significant: the API
// lowercases the slug itself.
const STATE_SLUG = /^[a-z][a-z0-9_-]*$/i;

/** True when `value` is shaped like a state slug. Says nothing about whether the state exists. */
export function isStateSlug(value: string): boolean {
  return STATE_SLUG.test(value);
}
