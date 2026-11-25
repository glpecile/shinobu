import { useEffect } from 'react';

/** Detect a second press on the same tab so the caller can refresh it. */

/**
 * Tab double-press window in ms, wider than a platform gesture to allow a deliberate second
 * press.
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
