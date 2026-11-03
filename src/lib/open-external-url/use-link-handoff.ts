import { useTransition } from 'react';

import { toast } from '@/lib/toast';

/** Shows feedback while an external-link opener is pending and restores retry on failure. */
export function useLinkHandoff(openLink: () => void | Promise<void>) {
  const [loading, startTransition] = useTransition();
  function open() {
    if (loading) return;
    // `startTransition` runs the action synchronously, inside the press, so a
    // web popup keeps its user activation. The catch stays inside: a rejected
    // async transition would reach the error boundary.
    startTransition(async () => {
      try {
        await openLink();
      } catch {
        toast.error('Could not open link', 'Try again or check that a browser is installed.');
      }
    });
  }
  return { loading, open };
}
