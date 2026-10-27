import { useDeferredValue, useSyncExternalStore } from 'react';

// Web's splash is static HTML (+html.tsx), and its prerender has to render every tab.
let revealed = process.env.EXPO_OS === 'web';
const listeners = new Set<() => void>();

/** Called once the native boot splash has faded out over the first screen. */
export function markBootRevealed() {
  if (revealed) return;
  revealed = true;
  for (const listener of listeners) listener();
}

function getRevealed() {
  return revealed;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Gates work the first screen doesn't show (other tabs, closed sheets) until
 * the splash has faded out. The flip renders as a deferred update, which
 * yields to touches.
 */
export function useBootRevealed(): boolean {
  return useDeferredValue(useSyncExternalStore(subscribe, getRevealed, getRevealed));
}
