import type { ReactNode } from 'react';

export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return open ? <>{children}</> : null;
}
