import { Text, View } from 'react-native';

import { CenteredNotice } from '@/components/centered-notice';
import Head from '@/components/head';
import { LoadMoreFooter } from '@/components/load-more-footer';
import { Skeleton } from '@/components/skeleton';
import { ViewToggle } from '@/components/view-toggle';
import { WallSkeleton } from '@/features/anime-seasons/wall-skeleton';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { PosterWall } from '@/features/watchlist/poster-wall';
import { WatchlistRows } from '@/features/watchlist/watchlist-rows';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { setWatchlistView, useWatchlistView } from '@/state/prefs/watchlist-view';
import { useSuspenseLetterboxdListFilmsQuery } from '@/state/queries/letterboxd';
import { ListsHeader, ProviderListLink } from './list-header';
import { ListLikeButton } from './list-like-button';

export function LetterboxdListFilms({ username, owner, slug, url }: { username: string | null; owner: string; slug: string; url: string }) {
  const pages = useSuspenseLetterboxdListFilmsQuery(owner, slug);
  const pushRoute = usePushRoute();
  const { openActions, sheetProps } = useCardActions();
  const view = useWatchlistView();
  const Layout = view === 'grid' ? PosterWall : WatchlistRows;
  const items = [...new Map(pages.data.pages.flatMap((page) => page.items).map((item) => [item.id, item])).values()];
  const title = pages.data.pages[0].title;
  return (
    <>
      <Head><title>{`${title} — Shinobu`}</title></Head>
      <ListsHeader provider="letterboxd" title={title} />
      <View className="flex-row items-center gap-3 px-6 pb-3">
        <Text className="font-sans text-muted text-sm flex-1 shrink" numberOfLines={2}>{`${items.length}${pages.hasNextPage ? '+' : ''} ${items.length === 1 ? 'film' : 'films'} · by ${owner}`}</Text>
        <ProviderListLink iconOnly provider="letterboxd" url={url} />
        {username != null && <ListLikeButton key={`${username}/${owner}/${slug}`} owner={owner} slug={slug} url={url} username={username} />}
        <ViewToggle onChange={setWatchlistView} view={view} />
      </View>
      {items.length === 0 ? (
        <CenteredNotice>
          <CenteredNotice.Title>This list is empty</CenteredNotice.Title>
          <CenteredNotice.Body>Films added to this list on Letterboxd will appear here.</CenteredNotice.Body>
          <ProviderListLink provider="letterboxd" url={url} />
        </CenteredNotice>
      ) : (
        <Layout
          entries={items.map((item) => ({ id: item.id, item, sources: [], sourceIds: [item.id] }))}
          footer={<LoadMoreFooter failed={pages.isFetchNextPageError} loading={pages.isFetchingNextPage} noun="films" onRetry={() => void pages.fetchNextPage()} />}
          onEndReached={pages.hasNextPage && !pages.isFetchingNextPage && !pages.isFetchNextPageError ? () => void pages.fetchNextPage() : undefined}
          onItemActions={openActions}
          onItemPress={(item) => pushRoute(routes.details(item.id, item.type))}
          onRefresh={() => void pages.refetch()}
          refreshing={pages.isRefetching}
        />
      )}
      <CardActionsSheet {...sheetProps} />
    </>
  );
}

/** Mirrors the header, toolbar, and persisted grid/row view without a layout jump. */
export function ListFilmsSkeleton() {
  return (
    <View className="flex-1">
      <ListsHeader provider="letterboxd" />
      <View className="flex-row items-center gap-3 px-6 pb-3">
        <Skeleton className="h-4 w-24 shrink rounded" />
        <View className="flex-1" />
        <Skeleton className="size-11 rounded-full" />
        <Skeleton className="size-11 rounded-full" />
        <Skeleton className="h-8 w-16 rounded" />
      </View>
      <WallSkeleton />
    </View>
  );
}
