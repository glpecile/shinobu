import type { ReactNode } from 'react';

/** Native links use MarkdownText's guarded press handler. */
export function MarkdownLinks({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
