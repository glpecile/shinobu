import { useEffect, useRef, useState } from 'react';

const SHOW_AFTER = 150;
const HOLD_FOR = 300;

/**
 * Whether a pending action shows its spinner: 150ms after `pending` turns true,
 * so a fast write never flashes one, then for at least 300ms, so it never blinks.
 * The timer waits on the wall clock, which is why this is an effect.
 */
export function useDelayedBusy(pending: boolean): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (pending === shown) return;
    const wait = pending ? SHOW_AFTER : shownAt.current + HOLD_FOR - Date.now();
    const timer = setTimeout(
      () => {
        shownAt.current = Date.now();
        setShown(pending);
      },
      Math.max(0, wait),
    );
    return () => clearTimeout(timer);
  }, [pending, shown]);
  return shown;
}
