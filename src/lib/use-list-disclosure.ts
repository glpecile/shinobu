import { useState } from 'react';

/** Expansion belongs to the list, so a header can unmount without closing its rows. */
export function useListDisclosure<T extends string | number = string>() {
  const [expanded, setExpanded] = useState<ReadonlySet<T>>(new Set());

  function toggle(key: T) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return { expanded, toggle };
}
