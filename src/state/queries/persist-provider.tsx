import { hydrate, IsRestoringProvider, QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
  type PersistedClient,
  type Persister,
} from '@tanstack/react-query-persist-client';
import { useEffect, useState, type ReactNode } from 'react';

import { isPersistedQueryKey, persistOptions } from './persist';

/**
 * Suspense queries ignore `isRestoring`, so with an async restore the first
 * render's Up Next and watchlist reads fetch from the network before the
 * snapshot lands. Native reads MMKV synchronously and hydrates before that
 * render. Web restores after mount, so its first render matches the
 * prerendered HTML.
 */
const RESTORES_SYNC = process.env.EXPO_OS !== 'web';

/** `persistQueryClientRestore` without its `await`, for the synchronous MMKV persister. */
function restoreNow(client: QueryClient, persister: Persister) {
  try {
    const persisted = persister.restoreClient() as PersistedClient | undefined;
    if (persisted == null) return;
    if (Date.now() - persisted.timestamp > persistOptions.maxAge || persisted.buster !== persistOptions.buster) {
      void persister.removeClient();
      return;
    }
    hydrate(client, persisted.clientState);
  } catch {
    void persister.removeClient();
  }
}

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
  const [isRestoring, setIsRestoring] = useState(() => {
    if (!RESTORES_SYNC) return true;
    restoreNow(client, persister);
    return false;
  });

  useEffect(() => {
    const options = { ...persistOptions, queryClient: client, persister };
    let unsubscribe: (() => void) | undefined;
    let active = true;
    // Restore already discards a corrupt snapshot; recovery must also consume its rejection.
    const restored = RESTORES_SYNC ? Promise.resolve() : persistQueryClientRestore(options).catch(() => {});
    void restored.finally(() => {
      if (!active) return;
      setIsRestoring(false);
      unsubscribe = client.getQueryCache().subscribe((event) => {
        if (
          (event.type === 'added' || event.type === 'updated' || event.type === 'removed') &&
          // Fetch status changes before new data arrives; dehydration walks the whole cache.
          !(event.type === 'updated' && event.action.type === 'fetch') &&
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
