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
 * - web's search tab press, also in the app shell — live when search is
 *   already open (a re-tap), or held pending until the screen mounts when the
 *   press also navigates. Touch browsers only raise the keyboard for a focus
 *   on the back of a user gesture, and the tab's tap is the only gesture in
 *   this flow, so the request rides along with it instead of the mount.
 *
 * A request emitted with no subscriber yet is held as pending and delivered
 * to the next subscriber, once: that is the navigating tab press, whose
 * screen does not exist at emit time. Every other emission has a mounted
 * subscriber and lands live, as before.
 *
 * Platform-neutral by design: no native-tab or DOM types cross this boundary.
 */
const listeners = new Set<() => void>();
let pending = false;

export function emitSearchFocusRequest(): void {
  pending = listeners.size === 0;
  for (const listener of listeners) listener();
}

/**
 * Registers `onRequest` for every focus request; returns an unsubscribe. A
 * request emitted before anyone subscribed fires immediately on subscribe —
 * but only on the first subscribe, so StrictMode's remount doesn't double it.
 */
export function onSearchFocusRequest(onRequest: () => void): () => void {
  listeners.add(onRequest);
  if (pending) {
    pending = false;
    onRequest();
  }
  return () => listeners.delete(onRequest);
}
