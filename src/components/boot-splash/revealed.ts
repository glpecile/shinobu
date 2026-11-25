import { useDeferredValue, useSyncExternalStore } from 'react';

// Web's splash is static HTML (+html.tsx), and its prerender has to render every tab.
let revealed = process.env.EXPO_OS === 'web';
const listeners = new Set<() => void>();

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

export function useBootRevealed(): boolean {
  return useDeferredValue(useSyncExternalStore(subscribe, getRevealed, getRevealed));
}
