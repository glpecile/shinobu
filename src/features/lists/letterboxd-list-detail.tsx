import { LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { View } from 'react-native';

import { CenteredNotice } from '@/components/centered-notice';
import Head from '@/components/head';
import { LoadMoreFooter } from '@/components/load-more-footer';
import { Skeleton } from '@/components/skeleton';
import { WallSkeleton } from '@/features/anime-seasons/wall-skeleton';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { PosterWall } from '@/features/media-layout/poster-wall';
import { WatchlistRows } from '@/features/media-layout/watchlist-rows';
import { MediaSortControl, SortingLoadedNotice } from '@/features/media-layout/media-sort-control';
import { MediaToolbar, MediaToolbarSkeleton } from '@/features/media-layout/media-toolbar';
import { DURATION } from '@/lib/motion';
import { sortMediaEntries } from '@/lib/media-sort';
import { useMediaSort } from '@/state/prefs/media-sort';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { useWatchlistView } from '@/state/prefs/watchlist-view';
import { useSuspenseLetterboxdListFilmsQuery } from '@/state/queries/letterboxd';
import { useMediaProgress } from '@/state/queries/media-progress';
import { ListsHeader, ProviderListLink } from './list-header';
import { AddToList } from './list-membership-form';
import { ListLikeButton } from './list-like-button';
import { ListProgress } from './list-progress';
import { ListsLoadError } from './lists-page';

const membershipLayout = LinearTransition.duration(DURATION.swap);

export function LetterboxdListFilms({ username, owner, slug, url }: { username: string | null; owner: string; slug: string; url: string }) {
  const pages = useSuspenseLetterboxdListFilmsQuery(owner, slug);
  const pushRoute = usePushRoute();
  const { openActions, sheetProps } = useCardActions();
  const view = useWatchlistView();
  const sort = useMediaSort('lists');
  const reducedMotion = useReducedMotion();
  const Layout = view === 'grid' ? PosterWall : WatchlistRows;
  const loaded = [...new Map((pages.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item])).values()];
  // Progress already resolves these film records; sorting observes that same
  // read instead of treating every scraped duration as unknown.
  const progress = useMediaProgress(loaded);
  const items = progress.items;
  const shareHref = routes.letterboxdList(owner, slug);
  if (pages.data == null) return <ListsLoadError onRetry={() => pages.refetch()} provider="letterboxd" shareHref={shareHref} url={url} />;
  const title = pages.data.pages[0].title;
  const target = username != null && username.toLowerCase() === owner.toLowerCase()
    ? { provider: 'letterboxd' as const, username, owner, slug, title, url } : null;
  return (
    <>
      <Head><title>{`${title} — Shinobu`}</title></Head>
      <ListsHeader
        shareHref={shareHref}
        metadata={<ListProgress countLabel={`${items.length}${pages.hasNextPage ? '+' : ''} ${items.length === 1 ? 'film' : 'films'}`} partial={pages.hasNextPage} state={progress} />}
        provider="letterboxd" subtitle={`by ${owner}`} title={title}
      />
      <MediaToolbar notice={sort !== 'default' && pages.hasNextPage ? <SortingLoadedNotice /> : undefined} view={view}>
        <MediaSortControl scope="lists" sort={sort} />
        <View className="flex-row items-center gap-1">
          <ProviderListLink iconOnly provider="letterboxd" url={url} />
          {username != null && <ListLikeButton key={`${username}/${owner}/${slug}`} owner={owner} slug={slug} url={url} username={username} />}
        </View>
      </MediaToolbar>
      {items.length === 0 ? (
        <CenteredNotice>
          <CenteredNotice.Icon name="list-outline" />
          <CenteredNotice.Title>This list is empty</CenteredNotice.Title>
          <CenteredNotice.Body>{target != null ? 'Use the + button to add your first film.' : 'Films added to this list on Letterboxd will appear here.'}</CenteredNotice.Body>
          <ProviderListLink provider="letterboxd" url={url} />
        </CenteredNotice>
      ) : (
        <Layout
          showActions={target != null}
          itemLayoutAnimation={reducedMotion ? undefined : membershipLayout}
          showWatched
          entries={sortMediaEntries(items.map((item) => ({ id: item.id, item, sources: [], sourceIds: [item.id] })), sort)}
          footer={<LoadMoreFooter failed={pages.isFetchNextPageError} loading={pages.isFetchingNextPage} noun="films" onRetry={() => void pages.fetchNextPage()} />}
          onEndReached={pages.hasNextPage && !pages.isFetchingNextPage && !pages.isFetchNextPageError ? () => void pages.fetchNextPage() : undefined}
          onItemActions={openActions}
          onItemPress={(item) => pushRoute(routes.details(item.id, item.type))}
          onRefresh={() => void pages.refetch()}
          refreshing={pages.isRefetching}
        />
      )}
      <CardActionsSheet {...sheetProps} canHide={false} listRemoval={target == null ? null : { target }} />
      {target != null && <AddToList items={items} target={target} />}
    </>
  );
}

/** Mirrors the header, toolbar, and persisted grid/row view without a layout jump. */
export function ListFilmsSkeleton({ likeButton, shareHref }: { likeButton: boolean; shareHref?: string }) {
  return (
    <View className="flex-1">
      <ListsHeader metadata={<Skeleton className="h-4 w-28 rounded" />} provider="letterboxd" shareHref={shareHref} subtitle="" />
      <MediaToolbarSkeleton actions={likeButton ? 3 : 2} layout />
      <WallSkeleton />
    </View>
  );
}
