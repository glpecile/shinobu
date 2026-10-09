import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { RefreshControl, Text, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { BackButton } from '@/components/back-button';
import { CenteredNotice } from '@/components/centered-notice';
import Head from '@/components/head';
import { List } from '@/components/List';
import { LoadMoreFooter } from '@/components/load-more-footer';
import { ProviderIcon } from '@/components/provider-icon';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { ViewToggle } from '@/components/view-toggle';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { ListCard } from '@/features/lists/list-card';
import { ListLikeButton } from '@/features/lists/list-like-button';
import { listsTitle, ListFilmsSkeleton, ListsRowSkeleton } from '@/features/lists/lists-row';
import { PosterWall } from '@/features/watchlist/poster-wall';
import { WatchlistRows } from '@/features/watchlist/watchlist-rows';
import { cn } from '@/lib/cn';
import { usePushRoute } from '@/lib/navigation';
import { openExternalUrl } from '@/lib/open-external-url';
import { letterboxdListsUrl, letterboxdListUrl, type LetterboxdListKind } from '@/lib/providers/letterboxd/lists';
import { routes } from '@/lib/routes';
import { setWatchlistView, useWatchlistView } from '@/state/prefs/watchlist-view';
import { useSuspenseLetterboxdListFilmsQuery, useSuspenseLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';

function LetterboxdLink({ url, iconOnly = false }: { url: string; iconOnly?: boolean }) {
  return <Button icon={<Button.Icon name="open-outline" />} iconOnly={iconOnly} label="View on Letterboxd" onPress={() => void openExternalUrl(url)} variant="quiet" />;
}

function ListsHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View className={cn('flex-row items-center gap-3 px-6 pb-4', screenHeaderTopPadding)}>
      <BackButton className="-ml-2" onPress={onBack} />
      <ProviderIcon id="letterboxd" size={20} />
      <Text className="font-display text-foreground text-2xl flex-1" numberOfLines={2}>{title}</Text>
    </View>
  );
}

function ListsIndex({ username, kind, url }: { username: string; kind: LetterboxdListKind; url: string }) {
  const pages = useSuspenseLetterboxdListsQuery(username, kind);
  const pushRoute = usePushRoute();
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.min(4, Math.floor(width / 264)));
  const lists = [...new Map(pages.data.pages.flatMap((page) => page.lists).map((list) => [list.id, list])).values()];
  if (lists.length === 0) return (
    <CenteredNotice>
      <CenteredNotice.Title>No lists yet</CenteredNotice.Title>
      <CenteredNotice.Body>{kind === 'liked' ? 'Like a list on Letterboxd to see it here.' : 'Create a public list on Letterboxd to see it here. Private lists aren’t available in Shinobu.'}</CenteredNotice.Body>
      <LetterboxdLink url={url} />
    </CenteredNotice>
  );
  return (
    <List
      key={columns}
      className="flex-1"
      contentContainerStyle={{ padding: 10 }}
      data={lists}
      estimatedItemSize={204}
      keyExtractor={(list) => list.id}
      numColumns={columns}
      onEndReached={pages.hasNextPage && !pages.isFetchingNextPage && !pages.isFetchNextPageError ? () => void pages.fetchNextPage() : undefined}
      refreshControl={<RefreshControl onRefresh={() => void pages.refetch()} refreshing={pages.isRefetching} />}
      renderItem={({ item }) => <View className="px-1.5 mb-3"><ListCard list={item} onPress={() => pushRoute(routes.letterboxdList(item.owner, item.slug))} /></View>}
      ListFooterComponent={
        <View className="items-center gap-3 pb-6">
          <LoadMoreFooter failed={pages.isFetchNextPageError} loading={pages.isFetchingNextPage} noun="lists" onRetry={() => void pages.fetchNextPage()} />
          <LetterboxdLink url={url} />
        </View>
      }
    />
  );
}

function ListFilms({ username, owner, slug, url, onBack }: { username: string | null; owner: string; slug: string; url: string; onBack: () => void }) {
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
      <ListsHeader onBack={onBack} title={title} />
      <View className="flex-row items-center gap-3 px-6 pb-3">
        <Text className="font-sans text-muted text-sm flex-1 shrink" numberOfLines={2}>{`${items.length}${pages.hasNextPage ? '+' : ''} ${items.length === 1 ? 'film' : 'films'} · by ${owner}`}</Text>
        <LetterboxdLink iconOnly url={url} />
        {username != null && <ListLikeButton key={`${username}/${owner}/${slug}`} owner={owner} slug={slug} url={url} username={username} />}
        <ViewToggle onChange={setWatchlistView} view={view} />
      </View>
      {items.length === 0 ? (
        <CenteredNotice>
          <CenteredNotice.Title>This list is empty</CenteredNotice.Title>
          <CenteredNotice.Body>Films added to this list on Letterboxd will appear here.</CenteredNotice.Body>
        </CenteredNotice>
      ) : (
        <Layout
          entries={items.map((item) => ({ id: item.id, item, sources: [], sourceIds: [item.id] }))}
          footer={<LoadMoreFooter failed={pages.isFetchNextPageError} loading={pages.isFetchingNextPage} noun="films" onRetry={() => void pages.fetchNextPage()} />}
          onEndReached={pages.hasNextPage && !pages.isFetchingNextPage && !pages.isFetchNextPageError ? () => void pages.fetchNextPage() : undefined}
          onItemActions={openActions}
          onItemPress={(item) => pushRoute(routes.details(item.id))}
          onRefresh={() => void pages.refetch()}
          refreshing={pages.isRefetching}
        />
      )}
      <CardActionsSheet {...sheetProps} />
    </>
  );
}

/** One browsing route: either a personal index or an owner-specific list of films. */
export default function ListsScreen() {
  const router = useRouter();
  const pushRoute = usePushRoute();
  const params = useLocalSearchParams<{ kind?: string; owner?: string; slug?: string }>();
  const connected = useConnectedProviders();
  const username = connected.includes('letterboxd') ? getLetterboxdUsername() : null;
  const kind = params.kind === 'liked' ? 'liked' : 'created';
  const detail = params.owner != null || params.slug != null;
  const url = detail ? letterboxdListUrl(params.owner ?? '', params.slug ?? '') : letterboxdListsUrl(username ?? '', kind);
  const { reset } = useQueryErrorResetBoundary();
  const title = detail ? 'List' : listsTitle(kind);
  function back() {
    if (router.canGoBack()) router.back();
    else router.replace(routes.home);
  }
  return (
    <View className="flex-1 bg-background">
      <Head><title>{`${title} — Shinobu`}</title></Head>
      {!detail && <ListsHeader onBack={back} title={title} />}
      {url == null ? (
        <>
          {detail && <ListsHeader onBack={back} title={title} />}
          <CenteredNotice>
            <CenteredNotice.Title>{detail ? 'Invalid list link' : 'Connect Letterboxd'}</CenteredNotice.Title>
            <CenteredNotice.Body>{detail ? 'This link doesn’t identify a Letterboxd list.' : 'Connect your Letterboxd username to browse your created and liked lists.'}</CenteredNotice.Body>
            {!detail && <CenteredNotice.Action icon={<Button.Icon name="link-outline" />} label="Connect Letterboxd" onPress={() => pushRoute(routes.settings)} />}
          </CenteredNotice>
        </>
      ) : (
        <ErrorBoundary
          key={url}
          onReset={reset}
          fallbackRender={({ resetErrorBoundary }) => (
            <>
              {detail && <ListsHeader onBack={back} title={title} />}
              <CenteredNotice>
                <CenteredNotice.Title>Couldn’t load {detail ? 'this list' : 'your lists'}</CenteredNotice.Title>
                <CenteredNotice.Body>Letterboxd may be blocking this page, or it may be private or no longer available.</CenteredNotice.Body>
                <CenteredNotice.Action icon={<Button.Icon name="refresh" />} label="Try again" onPress={resetErrorBoundary} />
                <LetterboxdLink url={url} />
              </CenteredNotice>
            </>
          )}
        >
          <Suspense fallback={detail ? <ListFilmsSkeleton onBack={back} /> : <ListsRowSkeleton />}>
            {detail ? <ListFilms onBack={back} owner={params.owner ?? ''} slug={params.slug ?? ''} url={url} username={username} /> : <ListsIndex kind={kind} username={username ?? ''} url={url} />}
          </Suspense>
        </ErrorBoundary>
      )}
    </View>
  );
}
