import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { syncQueryCacheWithSessions } from '@/state/session';

/** Mounted once at the app root: see `syncQueryCacheWithSessions`. Renders nothing. */
export function SessionCacheSync(): null {
  const queryClient = useQueryClient();
  useEffect(() => syncQueryCacheWithSessions(queryClient), [queryClient]);
  return null;
}
