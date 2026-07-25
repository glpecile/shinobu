/**
 * Bridges "the user asked for the search field" from wherever that gesture is
 * observable to the search screen's `TextInput`, which lives in a different
 * route file entirely. Two emitters today, both outside `search.tsx`:
 *
 * - the search tab's native `tabPress` event (fired on every tap, whether or
 *   not the tab is already active — only listenable at the
 *   `NativeTabs.Trigger` level in `app/(tabs)/_layout.tsx`). iOS's
 *   `role="search"` tab auto-focuses the field on its own; Android has no such
 *   affordance, so re-tapping an already-active search tab did nothing — this
 *   makes it open the keyboard like Twitter/Instagram's search tab does.
 * - web's ⌘/Ctrl+K shortcut in `components/app-shell/index.web.tsx`, when the
 *   search route is already the active one (navigating there instead focuses
 *   via the field's `autoFocus` on mount).
 *
 * Platform-neutral by design: no native-tab or DOM types cross this boundary.
 */
const listeners = new Set<() => void>();

export function emitSearchFocusRequest(): void {
  for (const listener of listeners) listener();
}

/** Registers `onRequest` for every focus request; returns an unsubscribe. */
export function onSearchFocusRequest(onRequest: () => void): () => void {
  listeners.add(onRequest);
  return () => listeners.delete(onRequest);
}
