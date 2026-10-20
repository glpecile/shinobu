import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Rail } from '@/components/rail';
import { Skeleton } from '@/components/skeleton';
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
            <View className="flex-row items-center gap-2 pe-8">{children}</View>
          </Rail>
        </View>
        {view != null && <View className="shrink-0"><ViewToggle onChange={setWatchlistView} view={view} /></View>}
      </View>
      {notice}
    </View>
  );
}

/**
 * Pill-sized placeholders with the same fixed layout-control slot. `labelled`
 * is a small labelled button (a list's Rename); `actions` are icon buttons,
 * each pulled in as the lists' `ToolbarIcon`.
 */
export function MediaToolbarSkeleton({ filter = false, labelled = false, actions = 0, layout = false }: { filter?: boolean; labelled?: boolean; actions?: number; layout?: boolean }) {
  return (
    <View className="flex-row items-center gap-3 px-6 pb-3">
      <View className="flex-1 min-w-0 flex-row items-center gap-2 overflow-hidden">
        {filter && <Skeleton className="h-9.5 w-36 shrink-0 rounded-full" />}
        <Skeleton className="h-9.5 w-40 shrink-0 rounded-full" />
        {labelled && <Skeleton className="h-9.5 w-24 shrink-0 rounded-full" />}
        {Array.from({ length: actions }).map((_, index) => (
          <View className="size-11 -mx-0.75 items-center justify-center" key={index}><Skeleton className="size-9.5 rounded-full" /></View>
        ))}
      </View>
      {layout && <View className="h-11 shrink-0 items-center justify-center android:size-11">
        <Skeleton className="h-8 w-20 rounded-md android:size-9.5 android:rounded-full" />
      </View>}
    </View>
  );
}
