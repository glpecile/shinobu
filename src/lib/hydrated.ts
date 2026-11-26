import { useSyncExternalStore } from 'react';

const subscribeNever = () => () => {};

/**
 * False while the web prerender and its hydration render, true from the next
 * commit and on native. Gate on it what the prerender can't know (the device
 * clock, a CSS variable) or must not fetch, so hydration matches the static
 * HTML (docs/solutions/web-hydration-error-418.md).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}
