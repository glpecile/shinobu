import { RefreshControl, useWindowDimensions, View } from 'react-native';

import { CenteredNotice } from '@/components/centered-notice';
import { List } from '@/components/List';
import { LoadMoreFooter } from '@/components/load-more-footer';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { usePushRoute } from '@/lib/navigation';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';
import { ListCard } from './list-card';
import { ProviderListLink } from './list-header';

/** Mirrors the index's column count and fixed-height cards. */
export function ListsGridSkeleton() {
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.min(4, Math.floor(width / 264)));
  return (
    <View className="flex-row flex-wrap px-2.5 pt-1.5">
      {Array.from({ length: columns * 2 }).map((_, index) => (
        <View className="p-1.5" key={index} style={{ width: `${100 / columns}%` }}>
          <Skeleton className="w-full h-44 rounded-lg" delay={staggerDelay(index)} />
        </View>
      ))}
    </View>
  );
}

/**
 * One paginated list index (created or liked) shared by Letterboxd and
 * Serializd: the empty state, the dedupe across pages, and the
 * grid + load-more + external-link footer. Only the query, provider copy,
 * count, and per-list href differ at the call sites.
 */
export function ListsIndex<T extends { id: string; title: string; owner: string; previews: NormalizedMediaItem[] }>({
  provider, url, lists, hasNextPage, isFetchingNextPage, isFetchNextPageError,
  isRefetching, refetch, fetchNextPage, count, href, noun = 'film', emptyBody,
}: {
  provider: ProviderId;
  url: string;
  lists: T[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  isRefetching: boolean;
  refetch: () => unknown;
  fetchNextPage: () => unknown;
  count: (list: T) => number | undefined;
  href: (list: T) => string;
  noun?: 'film' | 'item';
  emptyBody: string;
}) {
  const pushRoute = usePushRoute();
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.min(4, Math.floor(width / 264)));
  const pages = [...new Map(lists.map((list) => [list.id, list])).values()];
  if (pages.length === 0) return (
    <CenteredNotice>
      <CenteredNotice.Title>No lists yet</CenteredNotice.Title>
      <CenteredNotice.Body>{emptyBody}</CenteredNotice.Body>
      <ProviderListLink provider={provider} url={url} />
    </CenteredNotice>
  );
  return (
    <List
      key={columns}
      className="flex-1"
      contentContainerStyle={{ padding: 10 }}
      data={pages}
      estimatedItemSize={176}
      keyExtractor={(list) => list.id}
      numColumns={columns}
      onEndReached={hasNextPage && !isFetchingNextPage && !isFetchNextPageError ? () => void fetchNextPage() : undefined}
      refreshControl={<RefreshControl onRefresh={() => void refetch()} refreshing={isRefetching} />}
      renderItem={({ item }) => (
        <View className="px-1.5 mb-3"><ListCard count={count(item)} href={href(item)} list={item} noun={noun} onPress={() => pushRoute(href(item))} provider={provider} /></View>
      )}
      ListFooterComponent={
        <View className="items-center gap-3 pb-6">
          <LoadMoreFooter failed={isFetchNextPageError} loading={isFetchingNextPage} noun="lists" onRetry={() => void fetchNextPage()} />
          <ProviderListLink provider={provider} url={url} />
        </View>
      }
    />
  );
}
