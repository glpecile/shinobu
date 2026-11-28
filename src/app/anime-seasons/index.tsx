import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Suspense, startTransition, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { ErrorBoundary as QueryErrorBoundary } from 'react-error-boundary';

import { Button } from '@/components/button';
import { BackButton } from '@/components/back-button';
import { AnimatedView } from '@/components/animated-view';
import { CenteredNotice } from '@/components/centered-notice';
import { LoadMoreFooter } from '@/components/load-more-footer';
import { SectionEnter } from '@/components/section-enter';
import Head from '@/components/head';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { Pager } from '@/components/pager';
import { NativeSegmentedControl } from '@/components/native-segmented-control';
import { SeasonList, SeasonSkeleton } from '@/features/anime-seasons/season-list';
import { SeasonStrip, YearStepper } from '@/features/anime-seasons/season-picker';
import { wallEntering } from '@/features/anime-seasons/wall-entrance';
import { useWallMetrics } from '@/features/media-layout/poster-wall';
import { MediaToolbar } from '@/features/media-layout/media-toolbar';
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
import { useWatchlistView } from '@/state/prefs/watchlist-view';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { anilistQueryKeys, useSuspenseSeasonalAnimePagesQuery } from '@/state/queries/anilist';
import { useWarmPosters } from '@/features/anime-seasons/warm-posters';
import type { NormalizedMediaItem } from '@/types/media';

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

const FORMAT_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'TV', label: 'TV', accessibilityLabel: 'TV series' },
  { value: 'MOVIE', label: 'Films' },
] as const satisfies readonly {
  value: AnimeFormatFilter;
  label: string;
  accessibilityLabel?: string;
}[];

function SeasonWall({
  window,
  format,
  active,
  onItemActions,
  onShowAllFormats,
}: {
  window: AnimeSeasonWindow;
  format: AnimeFormatFilter;
  active: boolean;
  onItemActions: (item: NormalizedMediaItem) => void;
  onShowAllFormats: () => void;
}) {
  const pushRoute = usePushRoute();
  const pages = useSuspenseSeasonalAnimePagesQuery(window, format);
  const { columns } = useWallMetrics();
  useWarmPosters(
    anilistQueryKeys.seasonalAnimePages(window, format),
    pages.data.pages[0]?.items ?? [],
    columns * 3,
  );
  // AniList's popularity sort isn't stable across pages, so duplicates can span page boundaries.
  const items = useVisibleItems(uniqueById(pages.data.pages.flatMap((page) => page.items)));
  const nextAiring = Object.assign({}, ...pages.data.pages.map((page) => page.nextAiring ?? {}));
  const reduceMotion = useReducedMotion();

  if (items.length === 0) {
    return (
      <SectionEnter className="flex-1">
        <CenteredNotice>
          <CenteredNotice.Title>Nothing here</CenteredNotice.Title>
          <CenteredNotice.Body>
            {`AniList lists nothing for ${animeSeasonLabel(window)} yet.`}
          </CenteredNotice.Body>
          {format !== 'ALL' && (
            <CenteredNotice.Action
              icon={<Button.Icon name="albums-outline" />}
              label="Show all formats"
              onPress={onShowAllFormats}
              variant="quiet"
            />
          )}
        </CenteredNotice>
      </SectionEnter>
    );
  }

  return (
    // Container-level CSS keyframes: per-cell entering replays on virtualized scroll
    // (docs/solutions/entering-animation-on-virtualized-cells-replays.md) and Reanimated Keyframe pins web layout.
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
      <SeasonList
        active={active}
        footer={
          <LoadMoreFooter
            failed={pages.isError}
            loading={pages.isFetchingNextPage}
            noun="titles"
            onRetry={() => void pages.fetchNextPage()}
          />
        }
        items={items}
        nextAiring={nextAiring}
        onEndReached={
          pages.hasNextPage && !pages.isFetchingNextPage
            ? () => void pages.fetchNextPage()
            : undefined
        }
        onItemActions={onItemActions}
        onItemPress={(item) => pushRoute(routes.details(item.id, item.type))}
        onRefresh={pages.refetch}
      />
    </AnimatedView>
  );
}

function WallBoundary({
  window,
  format,
  active,
  onItemActions,
  onShowAllFormats,
}: {
  window: AnimeSeasonWindow;
  format: AnimeFormatFilter;
  active: boolean;
  onItemActions: (item: NormalizedMediaItem) => void;
  onShowAllFormats: () => void;
}) {
  const { reset } = useQueryErrorResetBoundary();
  return (
    <QueryErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => (
        <CenteredNotice>
          <CenteredNotice.Title>Something went wrong</CenteredNotice.Title>
          <CenteredNotice.Body>
            AniList didn’t respond. Check your connection and try again.
          </CenteredNotice.Body>
          <CenteredNotice.Action
            icon={<Button.Icon name="refresh" />}
            label="Try again"
            onPress={resetErrorBoundary}
          />
        </CenteredNotice>
      )}
      onReset={reset}
      resetKeys={[window.season, window.year, format]}
    >
      <Suspense fallback={<SeasonSkeleton animated={active} />}>
        <SeasonWall
          active={active}
          format={format}
          onItemActions={onItemActions}
          onShowAllFormats={onShowAllFormats}
          window={window}
        />
      </Suspense>
    </QueryErrorBoundary>
  );
}

function useTrailingFormat(format: AnimeFormatFilter): AnimeFormatFilter {
  const [trailing, setTrailing] = useState(format);
  useEffect(() => {
    if (trailing === format) return;
    const timer = setTimeout(() => startTransition(() => setTrailing(format)), DURATION.toggle);
    return () => clearTimeout(timer);
  }, [format, trailing]);
  return trailing;
}

export default function AnimeSeasonsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ season?: string; year?: string; format?: string }>();
  const now = animeSeasonAt(new Date());
  const window = parseAnimeSeasonWindow(params, now);
  const format = parseAnimeFormatFilter(params.format);
  const view = useWatchlistView();
  const { openActions, sheetProps } = useCardActions();
  const progress = useSharedValue(ANIME_SEASONS.indexOf(window.season));
  const trailingFormat = useTrailingFormat(format);

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
      <View className={cn('flex-row items-center gap-3 px-6', screenHeaderTopPadding, 'pb-2')}>
        <BackButton className="-ml-2" onPress={goBack} />
        <Text className="text-2xl font-display text-foreground">Anime</Text>
        <YearStepper className="ml-auto -mr-3" onChange={setWindow} window={window} />
      </View>
      <View className="sm:flex-row sm:items-center">
        <View className="px-6 pb-3 sm:pe-0">
          <SeasonStrip
            className="sm:w-96"
            onChange={setWindow}
            progress={progress}
            window={window}
          />
        </View>
        <View className="sm:flex-1">
          <MediaToolbar view={view}>
            <NativeSegmentedControl
              accessibilityLabel="Format"
              className="w-64 shrink-0"
              onChange={setFormat}
              options={FORMAT_OPTIONS}
              size="md"
              value={format}
            />
          </MediaToolbar>
        </View>
      </View>
      <Pager
        onSettle={(season) => router.setParams({ season })}
        options={ANIME_SEASONS}
        progress={progress}
        renderPage={(season) => {
          const pageFormat = season === window.season ? format : trailingFormat;
          return (
            <WallBoundary
              active={season === window.season}
              format={pageFormat}
              key={`${window.year}-${pageFormat}`}
              onItemActions={openActions}
              onShowAllFormats={() => setFormat('ALL')}
              window={{ season, year: window.year }}
            />
          );
        }}
        value={window.season}
      />
      <CardActionsSheet {...sheetProps} />
    </View>
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      <CenteredNotice>
        <CenteredNotice.Title>Something went wrong</CenteredNotice.Title>
        <CenteredNotice.Body>The season couldn’t be displayed.</CenteredNotice.Body>
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
