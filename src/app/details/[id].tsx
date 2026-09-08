import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import Head from '@/components/head';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ExpandableText } from '@/components/expandable-text';
import { FloatingBackButton } from '@/components/floating-back-button';
import { Image } from '@/components/image';
import { MorphText } from '@/components/morph-text';
import { PresstableOpacity } from '@/components/presstable';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import { Skeleton } from '@/components/skeleton';
import { StatTile } from '@/components/stat-tile';
import { ZoomableImage } from '@/components/zoomable-image';
import { AnimeSeasonsSection } from '@/features/anime-seasons/anime-seasons-section';
import { LogMediaButton } from '@/features/log-media/log-media-button';
import { watchlistCtaIsPrimary } from '@/features/log-media/release-gate';
import { WatchlistMediaButton } from '@/features/watchlist-media/watchlist-media-button';
import {
  PeopleSection,
  PeopleSectionsSkeleton,
  PersonCreditSheet,
  type PersonCredit,
} from '@/features/person';
import { ProviderLinksSection } from '@/features/provider-links/provider-links-section';
import { ReleaseTimeline } from '@/features/release-timeline/release-timeline';
import { StudioSheet } from '@/features/studio/studio-sheet';
import {
  formatRuntime,
  SeasonsSection,
  SeriesRuntimeTile,
} from '@/features/show-seasons';
import { SuspenseSection } from '@/components/suspense-section';
import { haptics } from '@/lib/haptics';
import { applyPrimaryMetadata } from '@/lib/providers/merge-metadata';
import { useTmdbToken } from '@/state/session/tmdb-token';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import {
  anilistQueryKeys,
  useAniListEntryStateQuery,
} from '@/state/queries/anilist';
import {
  mediaDetailsQueryKeys,
  useMediaDetailsQuery,
  useSuspenseMediaDetailsQuery,
} from '@/state/queries/media-details';
import {
  simklQueryKeys,
  useSimklLibraryEntryQuery,
} from '@/state/queries/simkl';
import { traktQueryKeys, useTraktMediaImages } from '@/state/queries/trakt';
import { useWatchedInfo } from '@/state/queries/watched-info';
import { useResolvedMediaItem } from '@/state/queries/resolve-item';
import { tmdbQueryKeys } from '@/state/queries/tmdb';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem, NormalizedStudio } from '@/types/media';

/** "2026 · 128 min · Drama, Thriller" from whichever fields exist. */
function metaLine(item: NormalizedMediaItem): string {
  return [
    item.year != null ? String(item.year) : null,
    item.runtime != null ? `${item.runtime} min` : null,
    item.genres != null && item.genres.length > 0
      ? item.genres.slice(0, 3).join(', ')
      : null,
  ]
    .filter((part) => part != null)
    .join(' · ');
}

/**
 * Turns an AniList list entry into the same "Watched/Watching …" phrasing the
 * Trakt line uses, so both providers' detail pages read identically. Null for
 * plan-to-watch (nothing watched yet to report).
 */
function anilistWatchedLabel(entry: {
  status: string | null;
  progress: number;
  repeat: number;
}): string | null {
  const episodes = `${entry.progress} ${entry.progress === 1 ? 'episode' : 'episodes'} logged`;
  switch (entry.status) {
    case 'CURRENT':
      return `Watching · ${episodes}`;
    case 'REPEATING':
      return `Rewatching · ${episodes}`;
    case 'COMPLETED':
      return entry.repeat > 0 ? `Watched ${entry.repeat + 1}×` : 'Watched';
    case 'PAUSED':
      return `Paused · ${episodes}`;
    case 'DROPPED':
      return `Dropped · ${episodes}`;
    default:
      return null;
  }
}

/**
 * "3 / 12" as a single stat value, replacing the old side-by-side
 * Progress + Total tiles. Only the progress half goes through MorphText:
 * AGENTS.md reserves the morph for text that changes in place from user
 * state, and the total is static catalogue data that would just churn the
 * animation. Caller renders the bare number instead when no total is known,
 * so a dangling "3 / " is impossible.
 */
function ProgressOfTotal({
  progress,
  total,
}: {
  progress: number;
  total: number;
}) {
  return (
    <View className="flex-row items-baseline mt-0.5">
      <MorphText className="text-foreground text-2xl font-sans-semibold">
        {progress}
      </MorphText>
      <Text className="text-muted text-2xl font-sans-semibold">{` / ${total}`}</Text>
    </View>
  );
}

/**
 * "Watched 3× · Jul 13, 2026" under the meta line — from whichever connected
 * provider records this item as watched: Trakt first (movies count plays,
 * shows count logged episodes), then the AniList list entry for anime, so
 * Trakt-sourced and AniList-sourced pages carry the same line. Lives as its
 * own element so the hooks only run once the screen has a resolved item.
 *
 * The first leg is `useWatchedInfo`, not Trakt alone: a film logged to Simkl
 * and not Trakt is watched too, and used to render no line at all.
 */
function WatchedLine({ item }: { item: NormalizedMediaItem }) {
  const connected = useConnectedProviders();
  const watched = useWatchedInfo(item);
  const anilistEntry = useAniListEntryStateQuery({
    mediaId: item.externalIds.anilist,
    enabled: item.type === 'ANIME' && connected.includes('anilist'),
  });
  // Simkl's leg (plan 0034): the library entry gives a Simkl-sourced show the
  // same line Trakt-sourced pages carry.
  const simklEntry = useSimklLibraryEntryQuery({
    item,
    enabled: item.type === 'TV' && connected.includes('simkl'),
  });
  const accent = useCSSVariable('--color-accent');

  let label: string | null = null;
  if (watched != null) {
    const date = new Date(watched.lastWatchedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    label =
      item.type === 'TV'
        ? `Watching · ${watched.plays} ${watched.plays === 1 ? 'episode' : 'episodes'} logged`
        : watched.plays > 1
          ? `Watched ${watched.plays}× · ${date}`
          : `Watched · ${date}`;
  } else if (anilistEntry.data?.entry != null) {
    label = anilistWatchedLabel(anilistEntry.data.entry);
  } else if (
    simklEntry.data != null &&
    simklEntry.data.item.currentProgress > 0
  ) {
    // The verb is the entry's own status, not an assumption: the snapshot used
    // to be `watching`-filtered, so "Watching" was true by construction, and a
    // finished show saying "Watching · 153 episodes logged" is its own small
    // lie. The count is `watched_episodes_count`, **not** `watchedKeys.size` —
    // Simkl omits the per-episode `seasons[]` array entirely for a `completed`
    // show (verified on Doctor Who, 2026-08-01), so the key set is empty there
    // while the count is right.
    const count = simklEntry.data.item.currentProgress;
    const episodes = `${count} ${count === 1 ? 'episode' : 'episodes'} logged`;
    label =
      simklEntry.data.status === 'completed'
        ? `Watched · ${episodes}`
        : simklEntry.data.status === 'dropped'
          ? `Dropped · ${episodes}`
          : simklEntry.data.status === 'hold'
            ? `Paused · ${episodes}`
            : `Watching · ${episodes}`;
  }
  if (label == null) return null;

  return (
    <View className="flex-row items-center gap-1.5 mt-1.5">
      <Ionicons
        color={typeof accent === 'string' ? accent : undefined}
        name="checkmark-circle"
        size={13}
      />
      <MorphText className="text-muted font-sans text-sm">{label}</MorphText>
    </View>
  );
}

/** One "Studios" pill list — every metadata source renders through this. */
/**
 * Studio pills. Plain press navigates, as it always has; **long-press opens the
 * studio sheet** (plan 0035 R8) — the affordance credit cards have had since
 * plan 0028, which reversed that plan's "studio pills: nothing to expand"
 * boundary once the provider links turned out to be the thing to expand.
 *
 * One pressable per pill, with both handlers on it: nesting a second
 * gesture-handler button inside would let its press bubble into the pill's
 * (0028 KTD1). Without a TMDB token there is no route to navigate to, so the
 * pill's only job is the sheet and a plain press opens it.
 */
function StudiosList({ studios }: { studios: NormalizedStudio[] }) {
  const pushRoute = usePushRoute();
  // No TMDB token, no studio pages — a pill then opens the sheet on press.
  const canOpenStudios = useTmdbToken() !== '';
  const [studio, setStudio] = useState<NormalizedStudio | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function openStudio(next: NormalizedStudio) {
    haptics.selection();
    setStudio(next);
    setSheetOpen(true);
  }

  if (studios.length === 0) return null;

  return (
    <View className="mt-8">
      <Text className="text-xl font-display text-foreground mb-4">
        Studios
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {studios.map((entry) => (
          <PresstableOpacity
            // The border lives on the pressable's own className rather than an
            // inner View because uniwind maps it through the wrapper here — the
            // Android border gotcha applies to hand-rolled inner boxes, which
            // this is not (docs/solutions/pressto-border-not-drawn-on-android.md).
            className="bg-surface border border-border rounded-full px-4 py-2"
            key={entry.id}
            onLongPress={canOpenStudios ? () => openStudio(entry) : undefined}
            onPress={
              canOpenStudios
                ? () =>
                    pushRoute(
                      entry.tmdbId != null
                        ? routes.studio(entry.tmdbId)
                        : routes.studioLookup(entry.name),
                    )
                : () => openStudio(entry)
            }
          >
            <Text className="text-foreground font-sans text-sm">
              {entry.name}
            </Text>
          </PresstableOpacity>
        ))}
      </View>
      {/* Kept (not nulled) while closing so the sheet's content doesn't vanish
          mid-animation — same contract as the credit sheet above. */}
      <StudioSheet
        onClose={() => setSheetOpen(false)}
        open={sheetOpen}
        studio={studio}
      />
    </View>
  );
}

/**
 * Cast + Crew + Studios from the one TMDB-first metadata query (plan 0014) —
 * the same composed read regardless of the item's origin provider, with the
 * Trakt/AniList fallback handled inside the query, not by this boundary.
 */
function CreditsSections({ item }: { item: NormalizedMediaItem }) {
  const { data } = useSuspenseMediaDetailsQuery(item);
  // Long-press (web: the hover ⋯) on a credit card opens this instead of
  // navigating — the role text a 96px card had to clip is the whole point.
  const [credit, setCredit] = useState<PersonCredit | null>(null);
  const [creditOpen, setCreditOpen] = useState(false);

  function openCredit(next: PersonCredit) {
    haptics.selection();
    setCredit(next);
    setCreditOpen(true);
  }

  return (
    <>
      <PeopleSection
        onCreditActions={openCredit}
        title="Cast"
        people={data.cast.map((member) => ({
          id: member.id,
          name: member.name,
          role: member.character,
          kind: 'cast' as const,
          headshot: member.headshot,
          ...(member.tmdbId != null ? { tmdbId: member.tmdbId } : {}),
        }))}
      />
      <PeopleSection
        onCreditActions={openCredit}
        title="Crew"
        people={data.crew.map((member) => ({
          id: member.id,
          name: member.name,
          role: member.job,
          kind: 'crew' as const,
          headshot: member.headshot,
          ...(member.tmdbId != null ? { tmdbId: member.tmdbId } : {}),
        }))}
      />
      <StudiosList studios={data.studios} />
      {/* `credit` is kept (not nulled) while closing so the sheet's content
          doesn't vanish mid-animation — same contract as the card actions. */}
      <PersonCreditSheet
        credit={credit}
        onClose={() => setCreditOpen(false)}
        open={creditOpen}
      />
    </>
  );
}

function StudiosSkeleton() {
  return (
    <View className="mt-8">
      <Skeleton className="h-6 w-24 rounded mb-4" />
      <View className="flex-row gap-2">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-36 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </View>
    </View>
  );
}

/** Mirrors the loaded layout so content lands without a shift. */
function DetailsSkeleton() {
  return (
    <View className="flex-1 bg-background">
      <Skeleton className="h-80 w-full" />
      <View className="w-full max-w-4xl self-center px-6">
        <View className="flex-row items-end -mt-24 mb-6">
          <Skeleton className="w-28 h-40 rounded-card" />
          <View className="flex-1 ml-4 pb-1">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-8 w-56 rounded mt-2" />
            <Skeleton className="h-3 w-40 rounded mt-2" />
          </View>
        </View>
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-2/3 rounded mt-2" />
      </View>
    </View>
  );
}

export default function DetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const accent = useCSSVariable('--color-accent');
  // The hero scrim fades to the *page background*, not black: the title
  // straddles the image/page boundary and `text-foreground` is near-black in
  // the light theme, so a black scrim swallowed it there. Dark theme looks
  // the same as before (its background token is near-black).
  const backgroundVariable = useCSSVariable('--color-background');
  const background =
    typeof backgroundVariable === 'string' ? backgroundVariable : '#0a0a0a';
  // Bumped on pull-to-refresh so failed (unmounted) sections re-attempt.
  const [refreshCount, setRefreshCount] = useState(0);

  const { item, isLoading, refetchFeed } = useResolvedMediaItem(id);
  // TMDB is the metadata source of truth (plan 0014): the same composed
  // query that feeds the credit sections hands the header a catalogue
  // record, and its display fields override whatever the origin provider
  // carried. Non-suspending — the header renders instantly from the item
  // and sharpens when TMDB answers.
  const mediaDetails = useMediaDetailsQuery(item);
  const traktId = item?.externalIds.trakt;
  const anilistId = item?.externalIds.anilist;
  const connected = useConnectedProviders();
  // Items resolved from trending/search carry 0 progress even when the viewer
  // has already watched episodes. The live entry state corrects the stat tile.
  const anilistEntry = useAniListEntryStateQuery({
    mediaId: anilistId,
    enabled: item?.type === 'ANIME' && connected.includes('anilist'),
  });
  // The same correction for TV, from Simkl's library entry — a show opened
  // from search showed "0 / 153" for a series watched end to end. Shares
  // `WatchedLine`'s cache entry, so it costs no extra request.
  const simklEntry = useSimklLibraryEntryQuery({
    item: item?.type === 'TV' ? item : null,
    enabled: item?.type === 'TV' && connected.includes('simkl'),
  });
  // Items resolved from the watched feed arrive artless (Trakt dropped images
  // from /sync/watched/* in 2026) — recover poster/backdrop lazily.
  const artwork = useTraktMediaImages(item);

  function goBack() {
    if (process.env.EXPO_OS === 'web') {
      router.replace(routes.home);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.home);
    }
  }

  if (isLoading && item == null) {
    return <DetailsSkeleton />;
  }

  if (item == null) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Head>
          <title>Not found — Shinobu</title>
        </Head>
        <Text className="text-2xl font-display text-foreground mb-2">
          Not found
        </Text>
        <Text className="text-muted font-sans text-center mb-6">
          This item is not in your current feed.
        </Text>
        <PresstableOpacity
          className="bg-accent px-5 py-3 rounded"
          onPress={goBack}
        >
          <Text className="text-accent-foreground font-sans-semibold">
            Go back
          </Text>
        </PresstableOpacity>
      </View>
    );
  }

  const shown = applyPrimaryMetadata(item, mediaDetails.data?.catalogue);
  const meta = metaLine(shown);
  // "0 episodes" on a movie is noise — only show progress where it means
  // something (any TV/manga item, or a movie already logged at least once).
  const showProgress = shown.type !== 'MOVIE' || shown.currentProgress > 0;
  const displayedProgress =
    shown.type === 'ANIME'
      ? (anilistEntry.data?.entry?.progress ?? shown.currentProgress)
      : (simklEntry.data?.item.currentProgress ?? shown.currentProgress);

  function refresh() {
    // Sections that failed are unmounted, leaving their queries inactive and
    // stuck in error state — remove those so the resetKey remount refetches
    // from scratch. Healthy (active) ones refetch in the background instead,
    // without re-suspending into a skeleton.
    queryClient.removeQueries({
      queryKey: mediaDetailsQueryKeys.all,
      type: 'inactive',
    });
    if (traktId != null && item?.type === 'TV') {
      for (const key of [
        traktQueryKeys.seasons(traktId),
        traktQueryKeys.showProgress(traktId),
      ]) {
        queryClient.removeQueries({ queryKey: key, type: 'inactive' });
      }
    }
    // The TMDB seasons leg (plan 0034) fails the same way a Trakt one can.
    if (item?.externalIds.tmdb != null && item?.type === 'TV') {
      queryClient.removeQueries({
        queryKey: tmdbQueryKeys.seasons(item.externalIds.tmdb),
        type: 'inactive',
      });
    }
    if (anilistId != null && item?.type === 'ANIME') {
      for (const key of [
        anilistQueryKeys.entryState(anilistId),
        anilistQueryKeys.episodes(anilistId),
      ]) {
        queryClient.removeQueries({ queryKey: key, type: 'inactive' });
      }
    }
    setRefreshCount((count) => count + 1);
    return Promise.allSettled([
      refetchFeed(),
      queryClient.refetchQueries({
        queryKey: mediaDetailsQueryKeys.all,
        type: 'active',
      }),
      queryClient.refetchQueries({ queryKey: traktQueryKeys.all, type: 'active' }),
      queryClient.refetchQueries({ queryKey: anilistQueryKeys.all, type: 'active' }),
      queryClient.refetchQueries({ queryKey: simklQueryKeys.all, type: 'active' }),
      queryClient.refetchQueries({ queryKey: tmdbQueryKeys.all, type: 'active' }),
    ]);
  }

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>{`${shown.title} — Shinobu`}</title>
        {shown.overview != null && (
          <meta content={shown.overview} name="description" />
        )}
      </Head>
      {/* Full-bleed backdrop starts at y=0, so the Android spinner would
          otherwise land inside the notch. */}
      <RefreshableScrollView
        className="flex-1"
        onRefresh={refresh}
        spinnerBelowStatusBar
      >
        <View className="h-80 relative">
          <Image
            source={{
              uri:
                shown.backdropImage ||
                artwork.backdropImage ||
                shown.coverImage ||
                artwork.coverImage,
            }}
            className="w-full h-full"
            contentFit="cover"
          />
          {/* Same-hue transparent start (`#rrggbb00`), not 'transparent':
              fading from transparent-black to white passes through gray. */}
          <LinearGradient
            colors={[`${background}00`, background]}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 220,
            }}
          />
        </View>

        {/* max-w keeps wide (web) viewports readable; on phones it's inert. */}
        <View className="w-full max-w-4xl self-center px-6 pb-12">
          <View className="flex-row items-end -mt-24 mb-6">
            <ZoomableImage
              alt={shown.title}
              uri={shown.coverImage || artwork.coverImage}
              type="image"
              className="w-28 h-40 rounded-card border border-border bg-surface"
              contentFit="cover"
            />
            <View className="flex-1 ml-4 pb-1">
              <View className="flex-row items-center gap-3">
                <Text className="text-accent text-xs font-sans-semibold uppercase tracking-wider">
                  {shown.type}
                </Text>
                {shown.rating != null && (
                  <View className="flex-row items-center gap-1">
                    <Ionicons
                      color={typeof accent === 'string' ? accent : undefined}
                      name="star"
                      size={12}
                    />
                    <Text className="text-foreground text-xs font-sans-semibold">
                      {shown.rating.toFixed(1)}
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-3xl font-display text-foreground mt-1">
                {shown.title}
              </Text>
              {meta !== '' && (
                <Text className="text-muted font-sans text-sm mt-1.5">
                  {meta}
                </Text>
              )}
              <WatchedLine item={shown} />
            </View>
          </View>

          {shown.overview != null && <ExpandableText text={shown.overview} />}

          {/* Placement only, film-like only (plan 0031 R11): a film that isn't
              out yet can't be logged, so the want-to-watch CTA is the primary
              control and the disabled log button doesn't render. Everything
              else — including an airing series with no release date — keeps the
              log button and gets the CTA beneath it. */}
          {!watchlistCtaIsPrimary(shown) && <LogMediaButton item={shown} />}
          <WatchlistMediaButton item={shown} />

          {showProgress && (
            <View className="flex-row gap-4">
              <StatTile
                label="Progress"
                value={
                  shown.totalEpisodes == null ? (
                    displayedProgress
                  ) : (
                    <ProgressOfTotal
                      progress={displayedProgress}
                      total={shown.totalEpisodes}
                    />
                  )
                }
                // Manga counts chapters here (AniList's `chapters` lands in
                // the same field) — the label must follow the unit.
                caption={
                  shown.progressUnit === 'chapter' ? 'chapters' : 'episodes'
                }
              />
              {shown.type === 'TV' && <SeriesRuntimeTile item={shown} />}
              {shown.type === 'ANIME' && shown.isFilm !== true &&
                shown.totalEpisodes != null &&
                shown.runtime != null && (
                  <StatTile
                    label="Total time"
                    value={formatRuntime(shown.totalEpisodes * shown.runtime)}
                    caption={`${shown.runtime}m each`}
                  />
                )}
            </View>
          )}

          {shown.type === 'TV' && (
            <SeasonsSection item={shown} resetKey={refreshCount} />
          )}
          {shown.type === 'ANIME' && shown.isFilm !== true && (
            <AnimeSeasonsSection item={shown} resetKey={refreshCount} />
          )}

          <SuspenseSection
            fallback={
              <>
                <PeopleSectionsSkeleton />
                <StudiosSkeleton />
              </>
            }
            resetKey={refreshCount}
          >
            <CreditsSections item={item} />
          </SuspenseSection>

          <ReleaseTimeline item={shown} />

          <ProviderLinksSection item={shown} />
        </View>
      </RefreshableScrollView>

      <FloatingBackButton onPress={goBack} />
    </View>
  );
}
