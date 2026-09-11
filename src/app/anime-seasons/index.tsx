import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import {
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { Suspense, useDeferredValue, useState } from 'react';
import { Text, View } from 'react-native';
import { css, useReducedMotion } from 'react-native-reanimated';
import { ErrorBoundary as QueryErrorBoundary } from 'react-error-boundary';
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { CenteredNotice } from '@/components/centered-notice';
import { LoadMoreFooter } from '@/components/load-more-footer';
import Head from '@/components/head';
import { PresstableOpacity } from '@/components/presstable';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { SegmentedControl } from '@/components/segmented-control';
import { SeasonPicker } from '@/features/anime-seasons/season-picker';
import { WallSkeleton } from '@/features/anime-seasons/wall-skeleton';
import { PosterWall } from '@/features/watchlist/poster-wall';
import { WatchlistRows } from '@/features/watchlist/watchlist-rows';
import { ViewToggle } from '@/features/watchlist/watchlist-toolbar';
import { cn } from '@/lib/cn';
import { usePushRoute } from '@/lib/navigation';
import {
  animeSeasonAt,
  animeSeasonLabel,
  parseAnimeFormatFilter,
  parseAnimeSeasonWindow,
  type AnimeFormatFilter,
  type AnimeSeasonWindow,
} from '@/lib/providers/anilist/season';
import { routes } from '@/lib/routes';
import { useVisibleItems } from '@/state/prefs/hidden-items';
import { setWatchlistView, useWatchlistView } from '@/state/prefs/watchlist-view';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useSuspenseSeasonalAnimePagesQuery } from '@/state/queries/anilist';

/**
 * How a new wall arrives — the whole list resolving out of a blur, rising and
 * fading in once, on first load and on every season/format change (the list is
 * keyed by window). The *container*, never the cells: a virtualized list
 * re-mounts cells as they scroll back into view, and a per-cell entrance
 * replays on every fast scroll
 * (docs/solutions/entering-animation-on-virtualized-cells-replays.md). A CSS
 * keyframes rule rather than a layout `entering` because presets have no blur
 * and a custom Keyframe pins the element on web.
 */
const wallEntering = css.keyframes({
  from: { opacity: 0, filter: [{ blur: 6 }], transform: [{ translateY: 8 }] },
  to: { opacity: 1, filter: [{ blur: 0 }], transform: [{ translateY: 0 }] },
});
const wallFading = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/** "All" first: it is the home row's shape and the entry the row already cached. */
const FORMAT_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'TV', label: 'TV', accessibilityLabel: 'TV series' },
  { value: 'MOVIE', label: 'Movies' },
] as const satisfies readonly { value: AnimeFormatFilter; label: string; accessibilityLabel?: string }[];

/**
 * The AniList seasons explorer: the home feed's seasonal row, widened to any
 * cour of any year and narrowable by format. Same query and cache entry as the
 * row for the unfiltered current season, so opening it costs no request.
 *
 * Catalogue, not watchlist — the wall and the row list are borrowed for their
 * geometry, and `sources: []` keeps the provider marks off (they answer "which
 * of my trackers hold this", a question a public catalogue can't). Grid ⇄ list
 * rides the watchlist's device preference: it is the same taste on both
 * surfaces, not a per-screen setting.
 */
function SeasonWall({
  window,
  format,
}: {
  window: AnimeSeasonWindow;
  format: AnimeFormatFilter;
}) {
  const pushRoute = usePushRoute();
  const { openActions, sheetProps } = useCardActions();
  const pages = useSuspenseSeasonalAnimePagesQuery(window, format);
  const [refreshing, setRefreshing] = useState(false);
  // AniList's popularity sort is not stable across pages, so a title can sit
  // on the tail of one page and the head of the next; the list needs unique
  // keys, so the first occurrence wins.
  const items = useVisibleItems(uniqueById(pages.data.pages.flat()));
  const view = useWatchlistView();
  const reduceMotion = useReducedMotion();
  const Layout = view === 'grid' ? PosterWall : WatchlistRows;

  async function refresh() {
    setRefreshing(true);
    try {
      await pages.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  if (items.length === 0) {
    return (
      <CenteredNotice
        body={`AniList lists nothing for ${animeSeasonLabel(window)} yet.`}
        title="Nothing here"
      />
    );
  }

  return (
    <>
      <AnimatedView
        className="flex-1"
        style={{
          animationName: reduceMotion ? wallFading : wallEntering,
          animationDuration: DURATION.swap,
          animationTimingFunction: EASE_OUT,
        }}
        // Keyed by window: a new season is a new wall, and remounting is what
        // plays the entrance instead of the posters hard-cutting under the
        // same list.
        key={`${window.season}-${window.year}-${format}`}
      >
      <Layout
        entries={items.map((item) => ({ id: item.id, item, sources: [], sourceIds: [item.id] }))}
        footer={
          <LoadMoreFooter
            failed={pages.isError}
            loading={pages.isFetchingNextPage}
            noun="titles"
            onRetry={() => void pages.fetchNextPage()}
          />
        }
        onEndReached={
          pages.hasNextPage && !pages.isFetchingNextPage
            ? () => void pages.fetchNextPage()
            : undefined
        }
        onItemActions={openActions}
        onItemPress={(item) => pushRoute(routes.details(item.id))}
        onRefresh={() => void refresh()}
        refreshing={refreshing}
      />
      </AnimatedView>
      <CardActionsSheet {...sheetProps} />
    </>
  );
}

export default function AnimeSeasonsScreen() {
  const router = useRouter();
  const foreground = useCSSVariable('--color-foreground');
  const { reset } = useQueryErrorResetBoundary();
  const params = useLocalSearchParams<{ season?: string; year?: string; format?: string }>();
  const window = parseAnimeSeasonWindow(params, animeSeasonAt(new Date()));
  const format = parseAnimeFormatFilter(params.format);
  const view = useWatchlistView();
  // The controls track the URL instantly; the wall follows one step behind, so
  // switching season keeps the current posters on screen until the next set
  // has loaded instead of dropping to the loading notice for every tap.
  const deferredSeason = useDeferredValue(window.season);
  const deferredYear = useDeferredValue(window.year);
  const deferredFormat = useDeferredValue(format);

  // `setParams`, not a push: a different season is not a new destination,
  // and Back should leave the screen, not walk every season tried.
  function setWindow(next: AnimeSeasonWindow) {
    router.setParams({ season: next.season, year: String(next.year) });
  }
  function setFormat(next: AnimeFormatFilter) {
    router.setParams({ format: next });
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace(routes.home);
  }

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>{`${animeSeasonLabel(window)} Anime — Shinobu`}</title>
      </Head>
      <View
        className={cn(
          'flex-row items-center gap-3 px-6',
          screenHeaderTopPadding,
          'pb-4',
        )}
      >
        <PresstableOpacity
          accessibilityLabel="Back"
          className="w-9 h-9 -ml-2 items-center justify-center rounded-full"
          onPress={goBack}
        >
          <Ionicons
            color={typeof foreground === 'string' ? foreground : undefined}
            name="arrow-back"
            size={22}
          />
        </PresstableOpacity>
        <Text className="text-2xl font-display text-foreground">Anime Seasons</Text>
      </View>
      <SeasonPicker onChange={setWindow} window={window} />
      <View className="flex-row items-center gap-3 px-4 pb-3">
        <SegmentedControl
          accessibilityLabel="Format"
          className="w-52"
          onChange={setFormat}
          options={FORMAT_OPTIONS}
          size="sm"
          value={format}
        />
        <View className="flex-1" />
        <ViewToggle onChange={setWatchlistView} view={view} />
      </View>
      {/* The controls stay mounted outside the boundary: an AniList outage on
          one season must not take them with it, and the boundary resets on a
          window change so the next season gets a fresh attempt. */}
      <QueryErrorBoundary
        fallbackRender={({ resetErrorBoundary }) => (
          <CenteredNotice
            actionLabel="Try again"
            body="AniList didn’t respond. Check your connection and try again."
            onAction={resetErrorBoundary}
            title="Something went wrong"
          />
        )}
        onReset={reset}
        resetKeys={[window.season, window.year, format]}
      >
        <Suspense fallback={<WallSkeleton />}>
          <SeasonWall
            format={deferredFormat}
            window={{ season: deferredSeason, year: deferredYear }}
          />
        </Suspense>
      </QueryErrorBoundary>
    </View>
  );
}

/** Route-level containment for render-time faults; query failures are caught above. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      <CenteredNotice
        actionLabel="Try again"
        body="The season couldn’t be displayed."
        onAction={retry}
        title="Something went wrong"
      />
      <PresstableOpacity
        className="self-center mb-12"
        onPress={() => router.replace(routes.home)}
      >
        <Text className="text-muted font-sans">Go home</Text>
      </PresstableOpacity>
    </View>
  );
}
