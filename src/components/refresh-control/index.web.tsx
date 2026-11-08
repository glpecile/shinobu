import { type ComponentProps, useTransition } from 'react';
import { RefreshControl as GestureRefreshControl } from 'react-native-gesture-handler';

import { useTabDoubleTap } from '@/lib/navigation/tab-double-tap';

type RefreshControlProps = Omit<ComponentProps<typeof GestureRefreshControl>, 'onRefresh' | 'refreshing'> & {
  onRefresh: () => Promise<unknown>;
  /** Double-tapping this tab runs the same refresh, spinner included. */
  tab?: string;
};

/**
 * Pull-to-refresh whose spinner follows `onRefresh`'s promise. The pending
 * state lives here, so a pull re-renders the control, not the list it sits in.
 * Gesture-handler's, so the pull waits on the scroll gesture.
 */
export function RefreshControl({ onRefresh, tab, ...rest }: RefreshControlProps) {
  const [refreshing, startRefresh] = useTransition();
  function refresh() {
    // Swallowed here: a rejected async transition would reach the error boundary.
    startRefresh(async () => {
      await onRefresh().catch(() => undefined);
    });
  }
  useTabDoubleTap(tab, refresh);
  return <GestureRefreshControl {...rest} onRefresh={refresh} refreshing={refreshing} />;
}
