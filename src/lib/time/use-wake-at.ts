import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * Calls `wake` once the wall clock passes `at` (epoch ms), and whenever the app
 * returns to the foreground, since timers don't run while it is suspended. For
 * a component holding `now` as state: the clock moving notifies nobody.
 *
 * `now` is the caller's current reading. It re-arms the timer after every wake,
 * including one that fired a hair early and left `at` where it was.
 */
export function useWakeAt(at: number, now: Date, wake: () => void): void {
  useEffect(() => {
    const timer = setTimeout(wake, Math.max(0, at - Date.now()));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') wake();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [at, now, wake]);
}
