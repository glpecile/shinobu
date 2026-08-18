import { useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useTabDoubleTap } from '@/lib/navigation/tab-double-tap';

interface RefreshableScrollViewProps extends ScrollViewProps {
  /**
   * Kicks off the refresh; the spinner stays visible until the promise
   * settles. Rejections are swallowed here — screens surface their own error
   * state from the query results, so a failed refresh must not crash the
   * gesture.
   */
  onRefresh: () => Promise<unknown>;
  /**
   * Opt in on screens whose content runs full-bleed under the status bar (the
   * details screen's backdrop). Android draws the refresh spinner at the
   * scroll view's top edge, which on those screens is *behind the notch* —
   * `progressViewOffset` pushes it below the inset (plan 0024 R9). iOS ignores
   * the prop entirely (its spinner tracks the pull), so this is Android-only
   * in effect; header-padded screens don't need it.
   */
  spinnerBelowStatusBar?: boolean;
  /**
   * The route name of the tab this scroll surface belongs to (`index`,
   * `diary`, `connect`). Double-tapping that tab then runs the same
   * `onRefresh` the pull gesture does, spinner and all — the bottom-bar idiom
   * every native app has. Omitted on screens that aren't a tab root (details,
   * watchlist): they have no trigger to double-tap.
   */
  tab?: string;
}

/**
 * ScrollView with a theme-tinted pull-to-refresh, used by every screen-level
 * scroll surface. On web react-native-web's RefreshControl is a no-op
 * pass-through (there is no pull gesture on desktop), so this stays universal
 * with no platform fork.
 */
export function RefreshableScrollView({
  onRefresh,
  spinnerBelowStatusBar,
  tab,
  children,
  ...rest
}: RefreshableScrollViewProps) {
  const [refreshing, setRefreshing] = useState(false);
  const accent = useCSSVariable('--color-accent');
  const tint = typeof accent === 'string' ? accent : undefined;
  // Context comes from the navigation stack's provider; the hook is safe on
  // web too (zero insets), so no platform fork is needed here.
  const insets = useSafeAreaInsets();

  function refresh() {
    setRefreshing(true);
    onRefresh()
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }

  // Same entry point as the pull gesture, so the spinner and the swallowed
  // rejection behave identically however the refresh was asked for.
  useTabDoubleTap(tab, refresh);

  return (
    <ScrollView
      {...rest}
      refreshControl={
        <RefreshControl
          colors={tint != null ? [tint] : undefined}
          onRefresh={refresh}
          progressViewOffset={
            spinnerBelowStatusBar === true ? insets.top : undefined
          }
          refreshing={refreshing}
          tintColor={tint}
        />
      }
    >
      {children}
    </ScrollView>
  );
}
