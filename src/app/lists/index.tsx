import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { CenteredNotice } from '@/components/centered-notice';
import Head from '@/components/head';
import { LoadMoreFooter } from '@/components/load-more-footer';
import { ViewToggle } from '@/components/view-toggle';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { ListsHeader, ProviderListLink } from '@/features/lists/list-header';
import { ListsGridSkeleton, ListsIndex } from '@/features/lists/lists-grid';
import { ListLikeButton } from '@/features/lists/list-like-button';
import { SerializdListItems, SerializdListSkeleton } from '@/features/lists/serializd-list-detail';
import { listsTitle, ListFilmsSkeleton } from '@/features/lists/lists-row';
import { PosterWall } from '@/features/watchlist/poster-wall';
import { WatchlistRows } from '@/features/watchlist/watchlist-rows';
import { usePushRoute } from '@/lib/navigation';
import { letterboxdListsUrl, letterboxdListUrl, type LetterboxdListKind } from '@/lib/providers/letterboxd/lists';
import { PROVIDERS } from '@/lib/providers/registry';
import { serializdListsUrl, serializdListUrl, type SerializdListKind } from '@/lib/providers/serializd/lists';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { setWatchlistView, useWatchlistView } from '@/state/prefs/watchlist-view';
import { useSuspenseLetterboxdListFilmsQuery, useSuspenseLetterboxdListsQuery } from '@/state/queries/letterboxd';
import { useSuspenseSerializdListsQuery } from '@/state/queries/serializd';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';

type ListsProvider = Extract<ProviderId, 'letterboxd' | 'serializd'>;

/** Copy that differs between the two providers' indexes and detail screens. */
const copy: Record<ListsProvider, { connect: string; invalid: string; error: string }> = {
  letterboxd: {
    connect: 'Connect your Letterboxd username to browse your created and liked lists.',
    invalid: 'This link doesn’t identify a Letterboxd list.',
    error: 'Letterboxd may be blocking this page, or it may be private or no longer available.',
  },
  serializd: {
    connect: 'Connect Serializd to browse your created and liked lists.',
    invalid: 'This link doesn’t identify a Serializd list.',
    error: 'The list may be private, unavailable, or your Serializd session may need reconnecting.',
  },
};

function LetterboxdIndex({ username, kind, url }: { username: string; kind: LetterboxdListKind; url: string }) {
  const pages = useSuspenseLetterboxdListsQuery(username, kind);
  return (
    <ListsIndex
      count={(list) => list.filmCount}
      emptyBody={kind === 'liked' ? 'Like a list on Letterboxd to see it here.' : 'Create a public list on Letterboxd to see it here. Private lists aren’t available in Shinobu.'}
      emptyTitle="No lists yet"
      fetchNextPage={() => void pages.fetchNextPage()}
      hasNextPage={pages.hasNextPage}
      href={(list) => routes.letterboxdList(list.owner, list.slug)}
      isFetchNextPageError={pages.isFetchNextPageError}
      isFetchingNextPage={pages.isFetchingNextPage}
      isRefetching={pages.isRefetching}
      lists={pages.data.pages.flatMap((page) => page.lists)}
      provider="letterboxd"
      refetch={() => void pages.refetch()}
      url={url}
    />
  );
}

function SerializdIndex({ username, kind, url }: { username: string; kind: SerializdListKind; url: string }) {
  const pages = useSuspenseSerializdListsQuery(username, kind);
  return (
    <ListsIndex
      count={(list) => list.itemCount}
      emptyBody={kind === 'liked' ? 'Like a list on Serializd to see it here.' : 'Create a list on Serializd to see it here.'}
      emptyTitle="No lists yet"
      fetchNextPage={() => void pages.fetchNextPage()}
      hasNextPage={pages.hasNextPage}
      href={(list) => routes.serializdList(list.id)}
      isFetchNextPageError={pages.isFetchNextPageError}
      isFetchingNextPage={pages.isFetchingNextPage}
      isRefetching={pages.isRefetching}
      lists={pages.data.pages.flatMap((page) => page.lists)}
      noun="item"
      provider="serializd"
      refetch={() => void pages.refetch()}
      url={url}
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
      <ListsHeader onBack={onBack} provider="letterboxd" title={title} />
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

/** One browsing route shared by Letterboxd and Serializd: the personal index or a provider list detail. */
function ListsScreen() {
  const router = useRouter();
  const pushRoute = usePushRoute();
  const params = useLocalSearchParams<{ provider?: string; kind?: string; owner?: string; slug?: string; id?: string }>();
  const connected = useConnectedProviders();
  const provider: ListsProvider = params.provider === 'serializd' ? 'serializd' : 'letterboxd';
  const username = connected.includes(provider) ? (provider === 'serializd' ? getSerializdUsername() : getLetterboxdUsername()) : null;
  const kind = params.kind === 'liked' ? 'liked' : 'created';
  const detail = provider === 'serializd' ? params.id != null : params.owner != null || params.slug != null;
  const url = provider === 'serializd'
    ? (detail ? serializdListUrl(params.id ?? '') : serializdListsUrl(username ?? ''))
    : (detail ? letterboxdListUrl(params.owner ?? '', params.slug ?? '') : letterboxdListsUrl(username ?? '', kind));
  const { reset } = useQueryErrorResetBoundary();
  const title = detail ? 'List' : listsTitle(kind);
  function back() {
    if (router.canGoBack()) router.back();
    else router.replace(routes.home);
  }
  return (
    <View className="flex-1 bg-background">
      <Head><title>{`${title} — Shinobu`}</title></Head>
      {!detail && <ListsHeader onBack={back} provider={provider} title={title} />}
      {url == null ? (
        <>
          {detail && <ListsHeader onBack={back} provider={provider} title={title} />}
          <CenteredNotice>
            <CenteredNotice.Title>{detail ? 'Invalid list link' : `Connect ${PROVIDERS[provider].label}`}</CenteredNotice.Title>
            <CenteredNotice.Body>{detail ? copy[provider].invalid : copy[provider].connect}</CenteredNotice.Body>
            {!detail && <CenteredNotice.Action icon={<Button.Icon name="link-outline" />} label={`Connect ${PROVIDERS[provider].label}`} onPress={() => pushRoute(routes.settings)} />}
          </CenteredNotice>
        </>
      ) : (
        <ErrorBoundary key={`${provider}/${username}/${url}`} onReset={reset} fallbackRender={({ resetErrorBoundary }) => (
          <>
            {detail && <ListsHeader onBack={back} provider={provider} title={title} />}
            <CenteredNotice>
              <CenteredNotice.Title>Couldn’t load {detail ? 'this list' : 'your lists'}</CenteredNotice.Title>
              <CenteredNotice.Body>{copy[provider].error}</CenteredNotice.Body>
              <CenteredNotice.Action icon={<Button.Icon name="refresh" />} label="Try again" onPress={resetErrorBoundary} />
              <ProviderListLink provider={provider} url={url} />
            </CenteredNotice>
          </>
        )}>
          <Suspense fallback={detail ? (provider === 'serializd' ? <SerializdListSkeleton onBack={back} /> : <ListFilmsSkeleton onBack={back} />) : <ListsGridSkeleton />}>
            {provider === 'serializd'
              ? (detail ? <SerializdListItems id={params.id ?? ''} onBack={back} url={url} username={username} /> : <SerializdIndex kind={kind} url={url} username={username ?? ''} />)
              : (detail ? <ListFilms onBack={back} owner={params.owner ?? ''} slug={params.slug ?? ''} url={url} username={username} /> : <LetterboxdIndex kind={kind} url={url} username={username ?? ''} />)}
          </Suspense>
        </ErrorBoundary>
      )}
    </View>
  );
}

export default ListsScreen;