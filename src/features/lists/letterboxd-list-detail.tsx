import { View } from 'react-native';

import { CenteredNotice } from '@/components/centered-notice';
import Head from '@/components/head';
import { LoadMoreFooter } from '@/components/load-more-footer';
import { Skeleton } from '@/components/skeleton';
import { ViewToggle } from '@/components/view-toggle';
import { WallSkeleton } from '@/features/anime-seasons/wall-skeleton';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { PosterWall } from '@/features/media-layout/poster-wall';
import { WatchlistRows } from '@/features/media-layout/watchlist-rows';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { setWatchlistView, useWatchlistView } from '@/state/prefs/watchlist-view';
import { useSuspenseLetterboxdListFilmsQuery } from '@/state/queries/letterboxd';
import { ListsHeader, ProviderListLink } from './list-header';
import { ListLikeButton } from './list-like-button';
import { ListProgress } from './list-progress';
import { ListsLoadError } from './lists-page';

export function LetterboxdListFilms({ username, owner, slug, url }: { username: string | null; owner: string; slug: string; url: string }) {
  const pages = useSuspenseLetterboxdListFilmsQuery(owner, slug);
  const pushRoute = usePushRoute();
  const { openActions, sheetProps } = useCardActions();
  const view = useWatchlistView();
  const Layout = view === 'grid' ? PosterWall : WatchlistRows;
  if (pages.data == null) return <ListsLoadError onRetry={() => pages.refetch()} provider="letterboxd" url={url} />;
  const items = [...new Map(pages.data.pages.flatMap((page) => page.items).map((item) => [item.id, item])).values()];
  const title = pages.data.pages[0].title;
  return (
    <>
      <Head><title>{`${title} — Shinobu`}</title></Head>
      <ListsHeader provider="letterboxd" subtitle={`by ${owner}`} title={title} />
      <View className="flex-row items-center gap-3 px-6 pb-3">
        <View className="flex-1 min-w-0 flex-row items-center gap-2">
            <ListProgress countLabel={`${items.length}${pages.hasNextPage ? '+' : ''} ${items.length === 1 ? 'film' : 'films'}`} items={items} partial={pages.hasNextPage} />
        </View>
        <View className="flex-row shrink-0 items-center">
          <ProviderListLink iconOnly provider="letterboxd" url={url} />
          {username != null && <ListLikeButton key={`${username}/${owner}/${slug}`} owner={owner} slug={slug} url={url} username={username} />}
          <View className="ml-2"><ViewToggle onChange={setWatchlistView} view={view} /></View>
        </View>
      </View>
      {items.length === 0 ? (
        <CenteredNotice>
          <CenteredNotice.Title>This list is empty</CenteredNotice.Title>
          <CenteredNotice.Body>Films added to this list on Letterboxd will appear here.</CenteredNotice.Body>
          <ProviderListLink provider="letterboxd" url={url} />
        </CenteredNotice>
      ) : (
        <Layout
          showWatched
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
      <ListsHeader provider="letterboxd" subtitle="" />
      <View className="flex-row items-center gap-3 px-6 pb-3">
        <View className="flex-1 flex-row items-center gap-2">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-4 w-20 rounded" />
        </View>
        <View className="flex-row items-center gap-1">
          <View className="size-11 items-center justify-center"><Skeleton className="size-5 rounded" /></View>
          <View className="size-11 items-center justify-center"><Skeleton className="size-5 rounded" /></View>
          <Skeleton className="h-8 w-20 rounded-full" />
        </View>
      </View>
      <WallSkeleton />
    </View>
  );
}
