import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Rail } from '@/components/rail';
import { ViewToggle } from '@/components/view-toggle';
import { setWatchlistView, type WatchlistView } from '@/state/prefs/watchlist-view';

/** Filters scroll together; the layout control never moves offscreen. */
export function MediaToolbar({ children, view, notice }: {
  children: ReactNode;
  view?: WatchlistView;
  notice?: ReactNode;
}) {
  return (
    <View className="gap-2 px-6 pb-3">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 min-w-0">
          <Rail accessibilityLabel="Title controls">
            <View className="flex-row items-center gap-3 pe-8">{children}</View>
          </Rail>
        </View>
        {view != null && <View className="shrink-0"><ViewToggle onChange={setWatchlistView} view={view} /></View>}
      </View>
      {notice}
    </View>
  );
}
