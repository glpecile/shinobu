import type { ReactNode } from 'react';

/** Touch actions keep their accessible button labels without hover-only UI. */
export function Tooltip({ children }: { label: string; fill?: boolean; children: ReactNode }) {
  return <>{children}</>;
}
