import { useEffect } from 'react';

/**
 * "Tap the tab you're already on, again" → refresh that screen, the same
 * gesture Twitter/Instagram/Apple's own apps put on a bottom bar. It lives
 * here rather than in a screen because only `app/(tabs)/_layout.tsx` can
 * observe a tab press: `NativeTabs.Trigger`'s `tabPress` fires on every tap
 * (active tab or not), and the screen it belongs to is a different route file
 * — the same boundary `features/search/focus-signal.ts` bridges for search.
 *
 * Native only in effect: the web shell is a sidebar with no pull-to-refresh
 * behind it (react-native-web's `RefreshControl` is a no-op), so
 * `_layout.web.tsx` emits nothing and every subscriber simply never fires.
 */

/**
 * Two presses of the *same* tab inside this window are one double tap.
 *
 * Deliberately far wider than the platform's own ~300ms double-tap timeout,
 * because what's measured here is not the gap between the two touches — it's
 * the gap between the two *JS* `tabPress` callbacks, and the native tab bar
 * adds its own delivery lag on top. Measured on the Pixel emulator
 * (2026-08-18): taps 204ms apart arrived 413ms apart, so a 400ms window
 * silently swallowed a real double tap. It also competes with nothing — a
 * single tab press has no delayed action being held back — so erring wide
 * costs at most one extra refresh of a screen the user is already looking at.
 */
export const TAB_DOUBLE_TAP_MS = 600;

const listeners = new Set<(tab: string) => void>();
const lastPressAt = new Map<string, number>();

/**
 * Call from a trigger's `tabPress`. Detection lives here, not per screen, so
 * every tab shares one window and one definition of "double".
 */
export function emitTabPress(tab: string, now: number = Date.now()): void {
  const previous = lastPressAt.get(tab);
  lastPressAt.set(tab, now);
  if (previous == null || now - previous >= TAB_DOUBLE_TAP_MS) return;
  // A triple tap is one double tap, not two overlapping ones — the third press
  // starts a fresh pair rather than firing a second refresh on top of the
  // in-flight one.
  lastPressAt.delete(tab);
  for (const listener of listeners) listener(tab);
}

/**
 * Registers `onDoubleTap` for every tab; returns an unsubscribe. The plain
 * function is what makes the window above testable without React —
 * `useTabDoubleTap` is the only caller in the app.
 */
export function onTabDoubleTap(
  onDoubleTap: (tab: string) => void,
): () => void {
  listeners.add(onDoubleTap);
  return () => {
    listeners.delete(onDoubleTap);
  };
}

/** Runs `onDoubleTap` when `tab`'s own trigger is double-tapped. */
export function useTabDoubleTap(
  tab: string | undefined,
  onDoubleTap: () => void,
): void {
  useEffect(() => {
    if (tab == null) return;
    return onTabDoubleTap((pressed) => {
      if (pressed === tab) onDoubleTap();
    });
  }, [tab, onDoubleTap]);
}
