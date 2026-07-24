/**
 * Bridges the search tab's native `tabPress` event (fired on every tap,
 * whether or not the tab is already active — only listenable at the
 * `NativeTabs.Trigger` level in `app/(tabs)/_layout.tsx`) to the search
 * screen's `TextInput`, which lives in a different route file entirely.
 * iOS's `role="search"` tab auto-focuses the field on its own; Android has no
 * such affordance, so re-tapping an already-active search tab did nothing —
 * this makes it open the keyboard like Twitter/Instagram's search tab does.
 */
const listeners = new Set<() => void>();

export function emitSearchTabPressed(): void {
  for (const listener of listeners) listener();
}

/** Registers `onPressed` for every search-tab tap; returns an unsubscribe. */
export function onSearchTabPressed(onPressed: () => void): () => void {
  listeners.add(onPressed);
  return () => listeners.delete(onPressed);
}
