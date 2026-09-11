import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import {
  useLocalSearchParams,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { Suspense, startTransition, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { ErrorBoundary as QueryErrorBoundary } from 'react-error-boundary';

import { Button } from '@/components/button';
import { AnimatedView } from '@/components/animated-view';
import { CenteredNotice } from '@/components/centered-notice';
import { LoadMoreFooter } from '@/components/load-more-footer';
import Head from '@/components/head';
import { PresstableOpacity } from '@/components/presstable';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { SegmentedControl } from '@/components/segmented-control';
import { SeasonPager } from '@/features/anime-seasons/season-pager';
import { SeasonPicker } from '@/features/anime-seasons/season-picker';
import { wallEntering } from '@/features/anime-seasons/wall-entrance';
import { WallSkeleton } from '@/features/anime-seasons/wall-skeleton';
import { PosterWall, useWallMetrics } from '@/features/watchlist/poster-wall';
import { WatchlistRows } from '@/features/watchlist/watchlist-rows';
import { ViewToggle } from '@/features/watchlist/watchlist-toolbar';
import { cn } from '@/lib/cn';
import { usePushRoute } from '@/lib/navigation';
import {
  ANIME_SEASONS,
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
import { anilistQueryKeys, useSuspenseSeasonalAnimePagesQuery } from '@/state/queries/anilist';
import { useWarmPosters } from '@/features/anime-seasons/warm-posters';
import { useThemeColor } from '@/lib/theme-color';
import type { NormalizedMediaItem } from '@/types/media';

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
  onItemActions,
}: {
  window: AnimeSeasonWindow;
  format: AnimeFormatFilter;
  onItemActions: (item: NormalizedMediaItem) => void;
}) {
  const pushRoute = usePushRoute();
  const pages = useSuspenseSeasonalAnimePagesQuery(window, format);
  const { columns } = useWallMetrics();
  // Three rows of the wall the device actually has: what the swap waits on
  // before it may paint, so a phone must not queue a desktop's worth.
  useWarmPosters(
    anilistQueryKeys.seasonalAnimePages(window, format),
    pages.data.pages[0] ?? [],
    columns * 3,
  );
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
    // The entrance (`wall-entrance`, per platform) plays once per mount, on
    // the *container* — a virtualized list re-mounts cells as they scroll
    // back into view, and a per-cell entrance replays on every fast scroll
    // (docs/solutions/entering-animation-on-virtualized-cells-replays.md). A
    // CSS keyframes rule rather than a layout `entering`: presets have no
    // blur and a custom Keyframe pins the element on web.
    //
    // Once per mount, and a window or format change is a mount: the boundary
    // above is keyed by both, so the wall plays this on the way in behind its
    // skeleton rather than hard-cutting under the old posters.
    <AnimatedView
      className="flex-1"
      style={
        reduceMotion
          ? undefined
          : {
              animationName: wallEntering,
              animationDuration: DURATION.swap,
              animationTimingFunction: EASE_OUT,
            }
      }
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
        onItemActions={onItemActions}
        onItemPress={(item) => pushRoute(routes.details(item.id))}
        onRefresh={() => void refresh()}
        refreshing={refreshing}
      />
    </AnimatedView>
  );
}

/**
 * One boundary per wall, so a failing cour degrades to its own page's notice
 * and the pager's other pages stay up. The boundary resets on a window
 * change, so the next window gets a fresh attempt.
 */
function WallBoundary({
  window,
  format,
  onItemActions,
}: {
  window: AnimeSeasonWindow;
  format: AnimeFormatFilter;
  onItemActions: (item: NormalizedMediaItem) => void;
}) {
  const { reset } = useQueryErrorResetBoundary();
  return (
    <QueryErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => (
        <CenteredNotice
          actionIcon={<Button.Icon name="refresh" />}
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
        <SeasonWall format={format} onItemActions={onItemActions} window={window} />
      </Suspense>
    </QueryErrorBoundary>
  );
}

/**
 * The format the cours *behind the edges* switch to, a pill's slide after the
 * one in front of the user — and as a transition, so each of those walls keeps
 * its posters while the new ones load.
 *
 * The pager deliberately keeps the neighbouring cours mounted, so a format tap
 * is three walls re-reading AniList, re-warming three screens of posters and
 * re-rendering three lists of cells. On web that is free — the pill is a
 * composited CSS transition and nothing on the main thread can reach it. On
 * native the same transition runs on the UI thread, which is also the thread
 * that renders those cells, so the two walls the user cannot see were landing
 * on the frames of the one animation they were looking at. Staggering them
 * costs nothing visible: a swipe takes longer to start than the slide takes to
 * finish, so a neighbour is never reached before it has caught up.
 *
 * An effect and not the press handler, which is where react.dev would put
 * anything caused by an interaction: the format lives in the URL, so it also
 * changes on Back, on a shared link, and on any other `setParams` — and a
 * stagger scheduled only from the tap would leave those walls on a format the
 * user left behind. The delay is a timer, which is a side effect wherever it
 * is written; syncing it to the prop is what makes it correct for every way
 * the prop can change.
 */
function useTrailingFormat(format: AnimeFormatFilter): AnimeFormatFilter {
  const [trailing, setTrailing] = useState(format);
  useEffect(() => {
    if (trailing === format) return;
    const timer = setTimeout(
      () => startTransition(() => setTrailing(format)),
      DURATION.toggle,
    );
    return () => clearTimeout(timer);
  }, [format, trailing]);
  return trailing;
}

export default function AnimeSeasonsScreen() {
  const router = useRouter();
  const foreground = useThemeColor('--color-foreground');
  const params = useLocalSearchParams<{ season?: string; year?: string; format?: string }>();
  const now = animeSeasonAt(new Date());
  const window = parseAnimeSeasonWindow(params, now);
  const format = parseAnimeFormatFilter(params.format);
  const view = useWatchlistView();
  const { openActions, sheetProps } = useCardActions();
  // Where the pager is, as a continuous cour index: the pager writes it on
  // every scroll frame and the season strip's pill reads it, so the pill rides
  // the finger instead of jumping once the swipe settles.
  const progress = useSharedValue(ANIME_SEASONS.indexOf(window.season));
  // The wall in front of the user takes the new format immediately, and the
  // boundaries below are *keyed* by it as they already were by year: a router
  // param update is a React transition, which by default keeps the old posters
  // revealed until the new ones load, and a fresh boundary is React's
  // documented opt-out from that. Holding a different catalogue's posters up
  // reads as the tap having been ignored and then the wall silently swapping —
  // true of last year's titles, and just as true of the series you filtered
  // out. The skeleton is the answer to the tap; it is also what web has been
  // doing all along, because its router update is not a transition there.
  const trailingFormat = useTrailingFormat(format);

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
            color={foreground}
            name="arrow-back"
            size={22}
          />
        </PresstableOpacity>
        <Text className="text-2xl font-display text-foreground">Anime Seasons</Text>
      </View>
      <SeasonPicker onChange={setWindow} progress={progress} window={window} />
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
      {/* Every format is cour-scoped, films included: the pager is the only
          wall host. The controls stay outside the boundaries — an AniList
          outage on one season must not take them with it. */}
      <SeasonPager
        onSettle={(season) => router.setParams({ season })}
        progress={progress}
        renderSeason={(season) => {
          // Keyed by the format this page is actually showing, not by the URL's:
          // an off-screen cour trails, and a key that ran ahead of its prop
          // would remount it onto the format it already had.
          const pageFormat = season === window.season ? format : trailingFormat;
          return (
            <WallBoundary
              format={pageFormat}
              key={`${window.year}-${pageFormat}`}
              onItemActions={openActions}
              window={{ season, year: window.year }}
            />
          );
        }}
        season={window.season}
      />
      <CardActionsSheet {...sheetProps} />
    </View>
  );
}

/** Route-level containment for render-time faults; query failures are caught above. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      <CenteredNotice
        actionIcon={<Button.Icon name="refresh" />}
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
