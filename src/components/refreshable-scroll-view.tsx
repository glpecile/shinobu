import { useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  type ScrollViewProps,
} from 'react-native';
import { useCSSVariable } from 'uniwind';

interface RefreshableScrollViewProps extends ScrollViewProps {
  /**
   * Kicks off the refresh; the spinner stays visible until the promise
   * settles. Rejections are swallowed here — screens surface their own error
   * state from the query results, so a failed refresh must not crash the
   * gesture.
   */
  onRefresh: () => Promise<unknown>;
}

/**
 * ScrollView with a theme-tinted pull-to-refresh, used by every screen-level
 * scroll surface. On web react-native-web's RefreshControl is a no-op
 * pass-through (there is no pull gesture on desktop), so this stays universal
 * with no platform fork.
 */
export function RefreshableScrollView({
  onRefresh,
  children,
  ...rest
}: RefreshableScrollViewProps) {
  const [refreshing, setRefreshing] = useState(false);
  const accent = useCSSVariable('--color-accent');
  const tint = typeof accent === 'string' ? accent : undefined;

  function refresh() {
    setRefreshing(true);
    onRefresh()
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }

  return (
    <ScrollView
      {...rest}
      refreshControl={
        <RefreshControl
          colors={tint != null ? [tint] : undefined}
          onRefresh={refresh}
          refreshing={refreshing}
          tintColor={tint}
        />
      }
    >
      {children}
    </ScrollView>
  );
}
