/** How long after a pointer-initiated close the page ignores clicks, in milliseconds. */
export const PAGE_CLICK_GUARD_MS = 400;

/**
 * Swallows clicks (and double-clicks) aimed at anything outside `inside` for a short window, and
 * returns a function that ends the window early.
 *
 * A double click or double tap closes the dialog with its first click; once the dialog has left
 * the top layer, the second click would be delivered to whatever sits beneath the pointer, such as
 * an answer button (the Quick Form has no undo) or the Back link. The listener runs in the capture
 * phase on `document` so it sees the click before any handler on the page. It only affects
 * pointer clicks that happen within the window; keyboard use is not delayed because a pointer
 * close is the only caller.
 */
export function guardPageClicks(inside: Node, windowMs: number = PAGE_CLICK_GUARD_MS): () => void {
  const swallowOutside = (event: Event) => {
    if (event.target instanceof Node && inside.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const events = ['click', 'dblclick'] as const;
  for (const type of events) document.addEventListener(type, swallowOutside, true);
  const timer = setTimeout(release, windowMs);
  function release() {
    clearTimeout(timer);
    for (const type of events) document.removeEventListener(type, swallowOutside, true);
  }
  return release;
}
