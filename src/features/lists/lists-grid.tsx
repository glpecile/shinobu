import { RefreshControl, useWindowDimensions, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CenteredNotice } from '@/components/centered-notice';
import { List } from '@/components/List';
import { LoadMoreFooter } from '@/components/load-more-footer';
import { staggerDelay } from '@/components/skeleton';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useHiddenLists, visibleByIds } from '@/state/prefs/hidden-items';
import { LIST_CARD_TEXT_HEIGHT, ListCard, NewListCard } from './list-card';
import { ListSheet, useListSheet } from './list-sheet';
import type { ListSummary } from './list-summary';
import { ListCardSkeleton } from './lists-row';
import { POSTER_STACK_RATIO } from './poster-stack';

const PADDING = 10;
const GUTTER = 8;

function useGrid() {
  const { width, fontScale } = useWindowDimensions();
  const columns = Math.max(1, Math.min(4, Math.floor(width / 264)));
  const cardWidth = (width - PADDING * 2) / columns - GUTTER * 2;
  return { columns, rowHeight: cardWidth / POSTER_STACK_RATIO + LIST_CARD_TEXT_HEIGHT * fontScale + 24 };
}

/** Mirrors one index page's column count and card shape. */
export function ListsGridSkeleton() {
  const { columns } = useGrid();
  return (
    <View className="flex-row flex-wrap px-2.5 pt-1.5">
      {/* Three rows: one index page holds 12 lists, so this is the first paint on desktop. */}
      {Array.from({ length: columns * 3 }).map((_, index) => (
        <View className="px-2 pb-6" key={index} style={{ width: `${100 / columns}%` }}>
          <ListCardSkeleton delay={staggerDelay(index)} />
        </View>
      ))}
    </View>
  );
}

type GridItem = ListSummary | { id: 'new' };

/**
 * One paginated list index (created or liked) shared by Letterboxd and
 * Serializd: the empty state, the dedupe across pages, the list sheet, and the
 * grid + load-more + external-link footer. Created leads with New list.
 */
export function ListsIndex({
  provider, kind, lists, hasNextPage, isFetchingNextPage, isFetchNextPageError,
  refetch, fetchNextPage, emptyBody,
}: {
  provider: ListSummary['provider'];
  kind: 'created' | 'liked';
  lists: ListSummary[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  refetch: () => Promise<unknown>;
  fetchNextPage: () => unknown;
  emptyBody: string;
}) {
  const pushRoute = usePushRoute();
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const { columns, rowHeight } = useGrid();
  const { openList, sheetProps } = useListSheet();
  const loaded = [...new Map(lists.map((list) => [list.id, list])).values()];
  const pages = visibleByIds(loaded, useHiddenLists(), (list) => [list.href]);
  const items: GridItem[] = kind === 'created' ? [{ id: 'new' }, ...pages] : pages;
  async function refresh() {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <>
      {loaded.length === 0 ? (
        <CenteredNotice>
          <CenteredNotice.Icon name="list-outline" />
          <CenteredNotice.Title>No lists yet</CenteredNotice.Title>
          <CenteredNotice.Body>{emptyBody}</CenteredNotice.Body>
          {kind === 'created' && <CenteredNotice.Action icon={<Button.Icon name="add" />} label="New list" onPress={() => pushRoute(routes.newList(provider))} />}
        </CenteredNotice>
      ) : items.length === 0 ? (
        <CenteredNotice>
          <CenteredNotice.Icon name="eye-off-outline" />
          <CenteredNotice.Title>Lists hidden</CenteredNotice.Title>
          <CenteredNotice.Body>Every list loaded so far is hidden. Unhide them in Settings.</CenteredNotice.Body>
          {hasNextPage
            ? <CenteredNotice.Action icon={<Button.Icon name="chevron-down" />} label="Load more" loading={isFetchingNextPage} onPress={() => void fetchNextPage()} />
            : <CenteredNotice.Action icon={<Button.Icon name="open-outline" />} label="Settings" onPress={() => pushRoute(routes.settings)} />}
        </CenteredNotice>
      ) : (
        <List
          key={columns}
          className="flex-1"
          contentContainerStyle={{ padding: PADDING, paddingBottom: process.env.EXPO_OS === 'android' ? 24 + insets.bottom : PADDING }}
          data={items}
          // One row, margin included: an estimate the library calls too large
          // starves its container pool (the web "creating one on demand"
          // warning) and skews the scroll extent.
          estimatedItemSize={rowHeight}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          onEndReached={hasNextPage && !isFetchingNextPage && !isFetchNextPageError ? () => void fetchNextPage() : undefined}
          // 0.3, deliberately below the poster's 0.6: the end latch only
          // re-arms past 1.3× the band, and one 12-list page is three rows.
          // A wider band never clears on a landed page, so every page costs
          // an exit-and-re-enter scroll; 0.3 re-arms on the landed page itself
          // (docs/solutions/legend-list-threshold-vs-short-pages.md).
          onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} />}
          renderItem={({ item }) => (
            <View className="px-2 pb-6">
              {'title' in item
                ? <ListCard list={item} onActions={openList} onPress={() => pushRoute(item.href)} />
                : <NewListCard onPress={() => pushRoute(routes.newList(provider))} provider={provider} />}
            </View>
          )}
          ListFooterComponent={
            <>
              {isFetchingNextPage && <View accessibilityLabel="Loading more lists" className="-mx-2.5"><ListsGridSkeleton /></View>}
              {!isFetchingNextPage && isFetchNextPageError && <View className="items-center pt-5 pb-6"><LoadMoreFooter failed loading={false} noun="lists" onRetry={() => void fetchNextPage()} /></View>}
            </>
          }
        />
      )}
      <ListSheet {...sheetProps} />
    </>
  );
}
