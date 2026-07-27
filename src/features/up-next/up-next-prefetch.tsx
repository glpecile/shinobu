import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { providersForFeed } from '@/lib/providers/routing';
import { prefetchUpNextInputs } from '@/state/queries/up-next';
import { useConnectedProviders } from '@/state/session';

/**
 * Mounted once at the app root, beside `NotificationsRuntime`: warms the Up
 * Next slot on cold start and on every foreground transition, so its ~6-deep
 * request waterfall overlaps app launch instead of starting when the user
 * looks at the home screen.
 *
 * Pairs with the persisted query cache (`state/queries/persist.ts`) — that one
 * makes the *first paint* instant from disk, this one makes what's painted
 * current. Renders nothing.
 *
 * `AppState` rather than a platform split: react-native-web backs it with
 * document visibility, so a browser tab returning to the foreground refreshes
 * on the same path native does.
 */
export function UpNextPrefetch(): null {
  const queryClient = useQueryClient();
  const connected = useConnectedProviders();

  useEffect(() => {
    // No feed provider connected means there is nothing to fetch — and caching
    // an empty result under the shared key would leave the real query looking
    // fresh-and-empty for a whole staleTime once one connects.
    if (providersForFeed(connected).length === 0) return;

    const warm = (): void => {
      void prefetchUpNextInputs(queryClient, connected);
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
