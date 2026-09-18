import type { ReactNode } from 'react';

/**
 * The body of a disclosure. Native mounts it only while open and leaves the
 * motion to the caller's `LayoutAnimation.configureNext(DISCLOSURE_LAYOUT)`;
 * web transitions its height (index.web.tsx).
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return open ? <>{children}</> : null;
}
