import type { ReactElement } from 'react';
import { RefreshControl, useWindowDimensions, View } from 'react-native';

import { CenteredNotice } from '@/components/centered-notice';
import { List } from '@/components/List';
import { LoadMoreFooter } from '@/components/load-more-footer';
import { usePushRoute } from '@/lib/navigation';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';
import { ListCard } from './list-card';
import { ProviderListLink } from './list-header';

export function ListsGrid<T extends { id: string; title: string; owner: string; previews: NormalizedMediaItem[] }>({
  lists, href, count, noun = 'film', refreshing, onRefresh, onEndReached, footer,
}: {
  lists: T[];
  href: (list: T) => string;
  count: (list: T) => number | undefined;
  noun?: 'film' | 'item';
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached?: () => void;
  footer: ReactElement;
}) {
  const pushRoute = usePushRoute();
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.min(4, Math.floor(width / 264)));
  return (
    <List
      key={columns}
      className="flex-1"
      contentContainerStyle={{ padding: 10 }}
      data={lists}
      estimatedItemSize={204}
      keyExtractor={(list) => list.id}
      numColumns={columns}
      onEndReached={onEndReached}
      refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} />}
      renderItem={({ item }) => (
        <View className="px-1.5 mb-3"><ListCard count={count(item)} href={href(item)} list={item} noun={noun} onPress={() => pushRoute(href(item))} /></View>
      )}
      ListFooterComponent={footer}
    />
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
  isRefetching, refetch, fetchNextPage, count, href, noun = 'film', emptyTitle, emptyBody,
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
  emptyTitle: string;
  emptyBody: string;
}) {
  const pages = [...new Map(lists.map((list) => [list.id, list])).values()];
  if (pages.length === 0) return (
    <CenteredNotice>
      <CenteredNotice.Title>{emptyTitle}</CenteredNotice.Title>
      <CenteredNotice.Body>{emptyBody}</CenteredNotice.Body>
      <ProviderListLink provider={provider} url={url} />
    </CenteredNotice>
  );
  return (
    <ListsGrid
      count={count}
      href={href}
      lists={pages}
      noun={noun}
      onEndReached={hasNextPage && !isFetchingNextPage && !isFetchNextPageError ? () => void fetchNextPage() : undefined}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
      footer={
        <View className="items-center gap-3 pb-6">
          <LoadMoreFooter failed={isFetchNextPageError} loading={isFetchingNextPage} noun="lists" onRetry={() => void fetchNextPage()} />
          <ProviderListLink provider={provider} url={url} />
        </View>
      }
    />
  );
}