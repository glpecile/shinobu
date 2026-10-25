import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { Rail } from '@/components/rail';
import { Skeleton } from '@/components/skeleton';
import { ViewToggle } from '@/components/view-toggle';
import { useMediaSort, type MediaSortScope } from '@/state/prefs/media-sort';
import { setWatchlistView, useWatchlistView, type WatchlistView } from '@/state/prefs/watchlist-view';

import { MediaSortControl } from './media-sort-control';

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
 * Render preference controls at their intrinsic sizes while data loads.
 * Only data-dependent actions need placeholders.
 */
export function MediaToolbarSkeleton({ filter = false, labelled = false, actions = 0, layout = false, scope = 'watchlist' }: { filter?: boolean; labelled?: boolean; actions?: number; layout?: boolean; scope?: MediaSortScope }) {
  const view = useWatchlistView();
  const sort = useMediaSort(scope);
  return (
    <MediaToolbar view={layout ? view : undefined}>
      {filter && <Skeleton className="h-9.5 w-36 shrink-0 rounded-full" />}
      <MediaSortControl scope={scope} sort={sort} />
      {labelled && <Button disabled icon={<Button.Icon name="create-outline" />} label="Rename" onPress={() => {}} size="sm" variant="quiet" />}
      {Array.from({ length: actions }).map((_, index) => (
        <View className="size-11 -mx-0.75 items-center justify-center" key={index}><Skeleton className="size-9.5 rounded-full" /></View>
      ))}
    </MediaToolbar>
  );
}
