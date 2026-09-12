/**
 * Cmd/Ctrl-click opens a route in a new tab (web). Every pressable in the app
 * is pressto over gesture-handler: it reports a press as an options object
 * with no DOM event behind it, and renders a view rather than an anchor, so
 * neither the browser nor the press handler can see the modifier. The last
 * pointerdown is where it still exists, and reading it here keeps every call
 * site — cards, rows, sheet actions — unaware that any of this happens.
 *
 * No `document` on native, and none during the static web export's prerender
 * either, so the listener simply never attaches there.
 */

/**
 * How long a recorded modifier stays valid. A press is a pointerdown away,
 * not a second — the window is what stops a stale cmd-click from turning the
 * *next* press (a keyboard activation, say, which has no pointerdown of its
 * own) into a new tab.
 */
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

/**
 * Opens `href` in a new tab when the press that asked for it was a
 * cmd/ctrl-click, and reports whether it did — a caller that gets `true`
 * leaves the current screen where it is.
 */
export function openedInNewTab(href: string): boolean {
  if (modifiedAt === 0 || Date.now() - modifiedAt > MODIFIER_TTL_MS) return false;
  modifiedAt = 0;
  window.open(href, '_blank', 'noopener');
  return true;
}
