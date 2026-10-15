import type { ReactNode } from 'react';

/** Browser tooltips escape scrolling-rail clipping and need no timers/portal. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <div title={label} style={{ display: 'inline-flex' }}>{children}</div>;
}
