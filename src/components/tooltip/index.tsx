import type { ReactNode } from 'react';

export function Tooltip({ children }: { label: string; fill?: boolean; children: ReactNode }) {
  return <>{children}</>;
}
