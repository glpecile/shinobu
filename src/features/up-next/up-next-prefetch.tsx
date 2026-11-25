import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { providersForFeed } from '@/lib/providers/routing';
import { prefetchUpNextInputs } from '@/state/queries/up-next';
import { useConnectedProviders } from '@/state/session';

export function UpNextPrefetch(): null {
  const queryClient = useQueryClient();
  const connected = useConnectedProviders();

  useEffect(() => {
    if (providersForFeed(connected).length === 0) return;

    const warm = (): void => {
      void prefetchUpNextInputs(queryClient);
    };

    warm();
    const subscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') warm();
      },
    );
    return () => subscription.remove();
  }, [queryClient, connected]);

  return null;
}
