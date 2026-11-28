import { useEffect, useRef, useState } from 'react';

const SHOW_AFTER = 150;
const HOLD_FOR = 300;

/**
 * Shows a pending action's spinner after 150ms, then for at least 300ms.
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
