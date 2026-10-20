import { IsRestoringProvider, QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
  type Persister,
} from '@tanstack/react-query-persist-client';
import { useEffect, useState, type ReactNode } from 'react';

import { isPersistedQueryKey, persistOptions } from './persist';

/**
 * TanStack's `PersistQueryClientProvider`, saving only when a persisted query
 * changes. Upstream dehydrates the whole cache synchronously on every cache
 * event and throttles only the write, so each list row's queries walked every
 * entry in the session's cache while the list scrolled.
 */
export function PersistQueryClientProvider({
  client,
  persister,
  children,
}: {
  client: QueryClient;
  persister: Persister;
  children: ReactNode;
}) {
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    const options = { ...persistOptions, queryClient: client, persister };
    let unsubscribe: (() => void) | undefined;
    let active = true;
    // Restore already discards a corrupt snapshot; recovery must also consume its rejection.
    void persistQueryClientRestore(options).catch(() => {}).finally(() => {
      if (!active) return;
      setIsRestoring(false);
      unsubscribe = client.getQueryCache().subscribe((event) => {
        if (
          (event.type === 'added' || event.type === 'updated' || event.type === 'removed') &&
          isPersistedQueryKey(event.query.queryKey)
        ) {
          void persistQueryClientSave(options);
        }
      });
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [client, persister]);

  return (
    <QueryClientProvider client={client}>
      <IsRestoringProvider value={isRestoring}>{children}</IsRestoringProvider>
    </QueryClientProvider>
  );
}
