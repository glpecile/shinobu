import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { allSettled } from 'better-all';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import Head from '@/components/head';
import { ScrollView, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ExpandableText } from '@/components/expandable-text';
import { FloatingBackButton } from '@/components/floating-back-button';
import { Image } from '@/components/image';
import { MorphText } from '@/components/morph-text';
import { PresstableOpacity, PresstableScale } from '@/components/presstable';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import { Skeleton } from '@/components/skeleton';
import { StatTile } from '@/components/stat-tile';
import { ZoomableImage } from '@/components/zoomable-image';
import { AnimeSeasonsSection } from '@/features/anime-seasons';
import { LogMediaButton } from '@/features/log-media/log-media-button';
import { ProviderLinksSection } from '@/features/provider-links/provider-links-section';
import {
  formatRuntime,
  SeasonsSection,
  SeriesRuntimeTile,
} from '@/features/show-seasons';
import { SuspenseSection } from '@/components/suspense-section';
import { initials } from '@/lib/initials';
import {
  applyPrimaryMetadata,
  mergeCatalogueMetadata,
} from '@/lib/providers/merge-metadata';
import { useTmdbToken } from '@/state/session/tmdb-token';
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
  traktQueryKeys,
  useTraktMediaImages,
  useTraktWatchedInfo,
} from '@/state/queries/trakt';
import { findInDiaryCache } from '@/state/queries/diary-cache';
import { findInSearchCache } from '@/state/queries/search-cache';
import { useMovieCatalogueQuery, useTraktIdentityQuery } from '@/state/queries/mapping';
import { tmdbQueryKeys } from '@/state/queries/tmdb';
import { useUnifiedFeed } from '@/state/queries/use-unified-feed';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem, NormalizedStudio } from '@/types/media';

function findItemById(
  id: string,
  groups: NormalizedMediaItem[][],
): NormalizedMediaItem | undefined {
  return groups.flat().find((item) => item.id === id);
}

/**
 * A card tapped on a person or studio page targets an item that exists in no
 * feed and no search — but it *is* sitting in the cached TMDB page query the
 * viewer just came from, so resolve against those rows (same trick as the
 * search cache above; both page shapes expose `rows[].items`). Trakt
 * identity is backfilled separately (`useTraktIdentityQuery`).
 */
function findInTmdbCache(
  queryClient: QueryClient,
  id: string,
): NormalizedMediaItem | undefined {
  return queryClient
    .getQueriesData<{ rows?: Array<{ items: NormalizedMediaItem[] }> }>({
      queryKey: tmdbQueryKeys.all,
    })
    .flatMap(([, data]) => data?.rows?.flatMap((row) => row.items) ?? [])
    .find((item) => item.id === id);
}

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
 * "Watched 3× · Jul 13, 2026" under the meta line — from whichever connected
 * provider records this item as watched: Trakt first (movies count plays,
 * shows count logged episodes), then the AniList list entry for anime, so
 * Trakt-sourced and AniList-sourced pages carry the same line. Lives as its
 * own element so the hooks only run once the screen has a resolved item.
 */
function WatchedLine({ item }: { item: NormalizedMediaItem }) {
  const connected = useConnectedProviders();
  const watched = useTraktWatchedInfo(item);
  const anilistEntry = useAniListEntryStateQuery({
    mediaId: item.externalIds.anilist,
    enabled: item.type === 'ANIME' && connected.includes('anilist'),
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

interface PersonCardProps {
  id: string;
  name: string;
  /** Character for cast, job title(s) for crew. */
  subtitle: string;
  headshot: string;
  /** TMDB person id — absent for AniList people (name lookup instead). */
  tmdbId?: number;
}

function PersonCard({
  name,
  subtitle,
  headshot,
  onPress,
}: Omit<PersonCardProps, 'id' | 'tmdbId'> & { onPress?: () => void }) {
  const content = (
    <>
      {headshot !== '' ? (
        <Image
          source={{ uri: headshot }}
          className="w-20 h-20 rounded-full bg-surface"
          contentFit="cover"
        />
      ) : (
        <View className="w-20 h-20 rounded-full bg-surface border border-border items-center justify-center">
          <Text className="text-muted font-sans-semibold text-lg">
            {initials(name)}
          </Text>
        </View>
      )}
      <Text
        className="text-foreground font-sans-semibold text-xs text-center mt-2"
        numberOfLines={1}
      >
        {name}
      </Text>
      {subtitle !== '' && (
        <Text
          className="text-muted font-sans text-xs text-center mt-0.5"
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      )}
    </>
  );

  if (onPress == null) {
    return <View className="w-24 items-center mr-4">{content}</View>;
  }
  return (
    <PresstableScale className="w-24 items-center mr-4" onPress={onPress}>
      {content}
    </PresstableScale>
  );
}

function PeopleSection({
  title,
  people,
}: {
  title: string;
  people: PersonCardProps[];
}) {
  const router = useRouter();
  // No TMDB token, no person pages — cards stay informational.
  const canOpenPeople = useTmdbToken() !== '';

  if (people.length === 0) return null;

  return (
    <View className="mt-8">
      <Text className="text-xl font-display text-foreground mb-4">{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {people.map(({ id, tmdbId, ...person }) => (
          <PersonCard
            key={id}
            {...person}
            onPress={
              canOpenPeople
                ? () =>
                    router.push(
                      tmdbId != null
                        ? routes.person(tmdbId)
                        : routes.personLookup(person.name),
                    )
                : undefined
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** One "Studios" pill list — every metadata source renders through this. */
function StudiosList({ studios }: { studios: NormalizedStudio[] }) {
  const router = useRouter();
  // No TMDB token, no studio pages — pills stay informational.
  const canOpenStudios = useTmdbToken() !== '';

  if (studios.length === 0) return null;

  return (
    <View className="mt-8">
      <Text className="text-xl font-display text-foreground mb-4">
        Studios
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {studios.map((studio) => {
          const pill = (
            <Text className="text-foreground font-sans text-sm">
              {studio.name}
            </Text>
          );
          return canOpenStudios ? (
            <PresstableOpacity
              className="bg-surface border border-border rounded-full px-4 py-2"
              key={studio.id}
              onPress={() =>
                router.push(
                  studio.tmdbId != null
                    ? routes.studio(studio.tmdbId)
                    : routes.studioLookup(studio.name),
                )
              }
            >
              {pill}
            </PresstableOpacity>
          ) : (
            <View
              className="bg-surface border border-border rounded-full px-4 py-2"
              key={studio.id}
            >
              {pill}
            </View>
          );
        })}
      </View>
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

  return (
    <>
      <PeopleSection
        title="Cast"
        people={data.cast.map((member) => ({
          id: member.id,
          name: member.name,
          subtitle: member.character,
          headshot: member.headshot,
          ...(member.tmdbId != null ? { tmdbId: member.tmdbId } : {}),
        }))}
      />
      <PeopleSection
        title="Crew"
        people={data.crew.map((member) => ({
          id: member.id,
          name: member.name,
          subtitle: member.job,
          headshot: member.headshot,
          ...(member.tmdbId != null ? { tmdbId: member.tmdbId } : {}),
        }))}
      />
      <StudiosList studios={data.studios} />
    </>
  );
}

function PeopleRailSkeleton() {
  return (
    <View className="mt-8">
      <Skeleton className="h-6 w-24 rounded mb-4" />
      {/* Enough cards to overflow any viewport up to the max-w-4xl container;
          overflow-hidden clips the excess, reading as an off-screen carousel. */}
      <View className="flex-row overflow-hidden">
        {Array.from({ length: 10 }).map((_, index) => (
          <View className="w-24 items-center mr-4" key={index}>
            <Skeleton className="w-20 h-20 rounded-full" />
            <Skeleton className="h-3 w-16 rounded mt-2" />
            <Skeleton className="h-2.5 w-12 rounded mt-1.5" />
          </View>
        ))}
      </View>
    </View>
  );
}

/** One rail per section behind the boundary (Cast + Crew). */
function PeopleSectionsSkeleton() {
  return (
    <>
      <PeopleRailSkeleton />
      <PeopleRailSkeleton />
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
  // includeHidden: hidden items must still resolve here — the Manage
  // Trackers hidden list links straight to this screen.
  const feed = useUnifiedFeed({ includeHidden: true });
  const queryClient = useQueryClient();
  const accent = useCSSVariable('--color-accent');
  // Bumped on pull-to-refresh so failed (unmounted) sections re-attempt.
  const [refreshCount, setRefreshCount] = useState(0);

  const resolvedItem =
    findItemById(id, [
      // Personal feeds first: an item can appear in both "Your Anime" and
      // the seasonal anime row, and the personal copy carries real progress.
      feed.yourShows,
      feed.yourAnime,
      feed.yourWatchlist,
      feed.trendingMovies,
      feed.trendingShows,
      feed.seasonalAnime,
    ]) ??
    // Search results belong to no feed slot (plan 0009) — and manga belongs to
    // no feed row at all, so this is the only way it resolves (plan 0024 U8).
    findInSearchCache(queryClient, id) ??
    // Diary rows live in no feed slot and no search — resolve them from the
    // cached diary pages the viewer just scrolled (plan 0016 KTD7/R6).
    findInDiaryCache(queryClient, id) ??
    findInTmdbCache(queryClient, id);
  // Items whose origin carries no metadata (a Letterboxd watchlist film is
  // just a slug + title + year) get a catalogue record resolved by title+year
  // and merged in — the meta line, overview, rating, and (via the discovered
  // trakt id) cast/studios then render like any other provider's page.
  const catalogue = useMovieCatalogueQuery(resolvedItem);
  // Filmography credits arrive TMDB-keyed with no Trakt identity — the
  // lookup discovers it so the trakt-id-keyed sections light up.
  const traktIdentity = useTraktIdentityQuery(resolvedItem);
  const enriched = catalogue.data ?? traktIdentity.data;
  const item =
    resolvedItem != null && enriched != null
      ? mergeCatalogueMetadata(resolvedItem, enriched)
      : resolvedItem;
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

  if (feed.isLoading && item == null) {
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
      : shown.currentProgress;

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
    if (anilistId != null && item?.type === 'ANIME') {
      for (const key of [
        anilistQueryKeys.entryState(anilistId),
        anilistQueryKeys.episodes(anilistId),
      ]) {
        queryClient.removeQueries({ queryKey: key, type: 'inactive' });
      }
    }
    setRefreshCount((count) => count + 1);
    return allSettled({
      feed: () => feed.refetch(),
      details: () =>
        queryClient.refetchQueries({
          queryKey: mediaDetailsQueryKeys.all,
          type: 'active',
        }),
      trakt: () =>
        queryClient.refetchQueries({ queryKey: traktQueryKeys.all, type: 'active' }),
      anilist: () =>
        queryClient.refetchQueries({ queryKey: anilistQueryKeys.all, type: 'active' }),
    });
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
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.95)']}
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

          <LogMediaButton item={shown} />

          {showProgress && (
            <View className="flex-row gap-4">
              <StatTile
                label="Progress"
                value={displayedProgress}
                caption={
                  shown.progressUnit === 'chapter' ? 'chapters' : 'episodes'
                }
              />
              {shown.totalEpisodes != null && (
                <StatTile
                  label="Total"
                  value={shown.totalEpisodes}
                  // Manga counts chapters here (AniList's `chapters` lands in
                  // the same field) — the label must follow the unit.
                  caption={
                    shown.progressUnit === 'chapter' ? 'chapters' : 'episodes'
                  }
                />
              )}
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

          {shown.type === 'TV' && <SeasonsSection item={shown} />}
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

          <ProviderLinksSection item={shown} />
        </View>
      </RefreshableScrollView>

      <FloatingBackButton onPress={goBack} />
    </View>
  );
}
