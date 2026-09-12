/**
 * Cmd/Ctrl-click opens a route in a new tab (web). The app's pressables are
 * gesture-handler views, not anchors, and pressto reports a press with no DOM
 * event behind it, so the modifier can only come from the pointer stream
 * (docs/solutions/cmd-click-cant-open-a-pressable-in-a-new-tab.md). No
 * `document` on native or in the static export's prerender, so the listener
 * never attaches there.
 */

/** Stops a stale cmd-click from turning a later, pointerless press into a tab. */
const MODIFIER_TTL_MS = 1_000;

let modifiedAt = 0;

if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (event) => {
      modifiedAt = event.metaKey || event.ctrlKey ? Date.now() : 0;
    },
    // Capture: gesture-handler stops propagation on the targets it claims.
    true,
  );
}

/** Whether the press being handled was a cmd/ctrl-click, opening `href` if so. */
export function openedInNewTab(href: string): boolean {
  if (modifiedAt === 0 || Date.now() - modifiedAt > MODIFIER_TTL_MS) return false;
  modifiedAt = 0;
  window.open(href, '_blank', 'noopener');
  return true;
}
