const STATE_NAMES: Record<string, string> = {
  texas: 'Texas',
  california: 'California',
  florida: 'Florida',
  illinois: 'Illinois',
  new_york: 'New York',
};

/**
 * Converts a lowercase state key (e.g. "texas") to its display name.
 * Falls back to title-casing the key if not in the map.
 */
export function formatStateName(stateKey: string): string {
  if (stateKey in STATE_NAMES) {
    return STATE_NAMES[stateKey] as string;
  }
  return stateKey
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
