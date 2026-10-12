import { useState } from 'react';

import { toast } from '@/lib/toast';

/** Shows feedback while an external-link opener is pending and restores retry on failure. */
export function useLinkHandoff(openLink: () => void | Promise<void>) {
  const [loading, setLoading] = useState(false);
  async function open() {
    if (loading) return;
    setLoading(true);
    try {
      await openLink();
    } catch {
      toast.error('Could not open link', 'Try again or check that a browser is installed.');
    } finally {
      setLoading(false);
    }
  }
  return { loading, open };
}
