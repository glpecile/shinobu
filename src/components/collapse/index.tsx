import type { ReactNode } from 'react';

/**
 * The body of a disclosure. iOS mounts it only while open and leaves the
 * motion to the caller's `LayoutAnimation.configureNext(DISCLOSURE_LAYOUT)`;
 * web and Android transition its height.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return open ? <>{children}</> : null;
}
