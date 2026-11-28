import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Suspense, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { BackButton } from '@/components/back-button';
import { CenteredNotice } from '@/components/centered-notice';
import { LoadMoreFooter } from '@/components/load-more-footer';
import { SectionEnter } from '@/components/section-enter';
import Head from '@/components/head';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { filterWatchlistEntries, parseWatchlistProvider } from '@/features/watchlist/filter';
import { PosterWall } from '@/features/media-layout/poster-wall';
import { WallSkeleton } from '@/features/anime-seasons/wall-skeleton';
import { MediaToolbarSkeleton } from '@/features/media-layout/media-toolbar';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { useSuspenseWatchlistQuery } from '@/features/watchlist/use-watchlist-entries';
import { WatchlistRows } from '@/features/media-layout/watchlist-rows';
import { WatchlistToolbar } from '@/features/watchlist/watchlist-toolbar';
import { sortMediaEntries } from '@/lib/media-sort';
import { useMediaSort } from '@/state/prefs/media-sort';
import { cn } from '@/lib/cn';
import { usePushRoute } from '@/lib/navigation';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { useWatchlistView } from '@/state/prefs/watchlist-view';
import { useLetterboxdWatchlistPagesQuery } from '@/state/queries/letterboxd';
import { useMediaMetadata } from '@/state/queries/media-metadata';
import type { NormalizedMediaItem } from '@/types/media';
import type { ProviderFailure } from '@/state/queries/settle';
import { refreshWatchlistInputs, watchlistQueryKeys } from '@/state/queries/watchlist';

function LegFailureNotice({
  failures,
  loading,
  onRetry,
}: {
  failures: readonly ProviderFailure[];
  loading: boolean;
  onRetry: () => void;
}) {
  if (failures.length === 0) return null;
  return (
    <View className="mx-3 mb-2 px-4 py-3 rounded-lg border border-border bg-surface">
      {failures.map((failure) => (
        <Text
          className="text-muted font-sans text-sm"
          key={failure.provider}
        >{`Couldn’t load your ${PROVIDERS[failure.provider].label} watchlist.`}</Text>
      ))}
      <Button
        accessibilityLabel="Retry loading your watchlist"
        className="self-start mt-2"
        icon={<Button.Icon name="refresh" />}
        label="Try again"
        loading={loading}
        onPress={onRetry}
        size="sm"
        variant="quiet"
      />
    </View>
  );
}

function WatchlistGrid({
  provider,
  onProviderChange,
}: {
  provider: ProviderId | null;
  onProviderChange: (provider: ProviderId | null) => void;
}) {
  const pushRoute = usePushRoute();
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => refreshWatchlistInputs(queryClient),
    networkMode: 'always',
  });
  const { openActions, sheetProps } = useCardActions();
  const [activeEntry, setActiveEntry] = useState<WatchlistEntry | null>(null);
  const { entries, errors, incomplete } = useSuspenseWatchlistQuery();
  const metadata = useMediaMetadata(entries.map((entry) => entry.item));
  const pages = useLetterboxdWatchlistPagesQuery();
  const view = useWatchlistView();
  const sort = useMediaSort('watchlist');
  const Layout = view === 'grid' ? PosterWall : WatchlistRows;
  const enriched = entries.map((entry, index) => ({ ...entry, item: metadata.items[index] }));
  const shown = sortMediaEntries(filterWatchlistEntries(enriched, provider), sort);
  const onItemActions = (item: NormalizedMediaItem) => {
    setActiveEntry(entries.find((entry) => entry.item.id === item.id) ?? null);
    openActions(item);
  };
  const onItemPress = (item: NormalizedMediaItem) => pushRoute(routes.details(item.id, item.type));

  function refresh() {
    return refreshWatchlistInputs(queryClient);
  }

  async function loadMore() {
    await pages.fetchNextPage();
    await queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.inputs() });
  }

  if (entries.length === 0 && errors.length > 0) {
    return (
      <CenteredNotice>
        <CenteredNotice.Title>Something went wrong</CenteredNotice.Title>
        <CenteredNotice.Body>
          Your watchlist couldn’t be loaded. Check your connection and try again.
        </CenteredNotice.Body>
        <CenteredNotice.Action
          icon={<Button.Icon name="refresh" />}
          label="Try again"
          onPress={() => void refresh()}
        />
      </CenteredNotice>
    );
  }

  if (entries.length === 0) {
    return (
      <SectionEnter className="flex-1">
        <CenteredNotice>
          <CenteredNotice.Icon name="bookmark-outline" />
          <CenteredNotice.Title>Nothing here yet</CenteredNotice.Title>
          <CenteredNotice.Body>
            Anything you add to a connected tracker’s watchlist shows up here.
          </CenteredNotice.Body>
          <CenteredNotice.Action
            icon={<Button.Icon name="search-outline" />}
            label="Find something to watch"
            onPress={() => pushRoute(routes.search)}
          />
        </CenteredNotice>
      </SectionEnter>
    );
  }

  const layout =
    shown.length === 0 ? (
      <CenteredNotice>
        <CenteredNotice.Title>Nothing here</CenteredNotice.Title>
        <CenteredNotice.Body>
          {`Nothing on your ${provider == null ? '' : PROVIDERS[provider].label} watchlist right now.`}
        </CenteredNotice.Body>
        <CenteredNotice.Action
          icon={<Button.Icon name="albums-outline" />}
          label="Show all trackers"
          onPress={() => onProviderChange(null)}
        />
      </CenteredNotice>
    ) : (
      <Layout
        entries={shown}
        footer={
          <LoadMoreFooter
            failed={pages.isError}
            loading={pages.isFetchingNextPage}
            noun="films"
            onRetry={() => void loadMore()}
          />
        }
        onEndReached={
          pages.hasNextPage && !pages.isFetchingNextPage && !pages.isFetchNextPageError
            ? () => void loadMore()
            : undefined
        }
        onItemActions={onItemActions}
        onItemPress={onItemPress}
        onRefresh={refresh}
      />
    );

  return (
    <>
      <WatchlistToolbar
        entries={entries}
        incomplete={incomplete}
        onProviderChange={onProviderChange}
        provider={provider}
        sort={sort}
        view={view}
      />
      <LegFailureNotice
        failures={errors}
        loading={retry.isPending}
        onRetry={() => retry.mutate()}
      />
      {layout}
      <CardActionsSheet
        {...sheetProps}
        watchlistRemoval={activeEntry == null ? null : { entry: activeEntry, errors, incomplete }}
      />
    </>
  );
}

export default function WatchlistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ provider?: string }>();
  const provider = parseWatchlistProvider(params.provider);

  function setProvider(next: ProviderId | null) {
    router.setParams({ provider: next ?? '' });
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace(routes.home);
  }

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Watchlist — Shinobu</title>
      </Head>
      <View className={cn('flex-row items-center gap-3 px-6', screenHeaderTopPadding, 'pb-4')}>
        <BackButton className="-ml-2" onPress={goBack} />
        <Text className="text-2xl font-display text-foreground">Watchlist</Text>
      </View>
      <Suspense
        fallback={
          <View className="flex-1">
            <MediaToolbarSkeleton filter layout />
            <WallSkeleton />
          </View>
        }
      >
        <WatchlistGrid onProviderChange={setProvider} provider={provider} />
      </Suspense>
    </View>
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      <CenteredNotice>
        <CenteredNotice.Title>Something went wrong</CenteredNotice.Title>
        <CenteredNotice.Body>Your watchlist couldn’t be displayed.</CenteredNotice.Body>
        <CenteredNotice.Action
          icon={<Button.Icon name="refresh" />}
          label="Try again"
          onPress={retry}
        />
      </CenteredNotice>
      <Button
        className="self-center mb-12"
        icon={<Button.Icon name="open-outline" />}
        label="Go home"
        onPress={() => router.replace(routes.home)}
        size="sm"
        variant="ghost"
      />
    </View>
  );
}
