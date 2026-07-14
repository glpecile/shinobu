import { Ionicons } from '@expo/vector-icons';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import Head from '@/components/head';
import { ScrollView, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Image } from '@/components/image';
import { PresstableOpacity } from '@/components/presstable';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import { Skeleton } from '@/components/skeleton';
import { StatTile } from '@/components/stat-tile';
import { AnimeSeasonsSection } from '@/features/anime-seasons';
import { LogMediaButton } from '@/features/log-media/log-media-button';
import {
  formatRuntime,
  SeasonsSection,
  SeriesRuntimeTile,
} from '@/features/show-seasons';
import { SuspenseSection } from '@/components/suspense-section';
import { routes } from '@/lib/routes';
import {
  anilistQueryKeys,
  useAniListEntryStateQuery,
  useSuspenseAniListCreditsQuery,
} from '@/state/queries/anilist';
import {
  traktQueryKeys,
  useSuspenseTraktPeopleQuery,
  useSuspenseTraktStudiosQuery,
  useTraktMediaImages,
  useTraktWatchedInfo,
} from '@/state/queries/trakt';
import { useUnifiedFeed } from '@/state/queries/use-unified-feed';
import { useConnectedProviders } from '@/state/session';
import type { MediaType, NormalizedMediaItem } from '@/types/media';

function findItemById(
  id: string,
  groups: NormalizedMediaItem[][],
): NormalizedMediaItem | undefined {
  return groups.flat().find((item) => item.id === id);
}

/**
 * Search results aren't part of the unified feed, so a tap from the search
 * screen resolves against the cached search queries instead (plan 0009). Cold
 * deep links still miss — the provider-fetch fallback stays with plan 0007.
 */
function findInSearchCache(
  queryClient: QueryClient,
  id: string,
): NormalizedMediaItem | undefined {
  return queryClient
    .getQueriesData<NormalizedMediaItem[]>({
      queryKey: traktQueryKeys.searchRoot(),
    })
    .flatMap(([, data]) => data ?? [])
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
      <Text className="text-muted font-sans text-sm">{label}</Text>
    </View>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * Synopsis clamped to two lines with a Read more toggle. Whether the text
 * actually overflows two lines depends on viewport width and font metrics, so
 * it's measured, not guessed: an invisible unclamped copy of the text lays
 * out alongside the clamped one, and the toggle renders only when the full
 * height exceeds the clamped height.
 */
function Overview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clampedHeight, setClampedHeight] = useState(0);
  const [fullHeight, setFullHeight] = useState(0);
  const clampable = fullHeight > clampedHeight + 1;

  return (
    <View className="mb-6">
      <Text
        className="text-foreground/90 font-sans text-base leading-relaxed"
        {...(expanded ? {} : { numberOfLines: 2 })}
        onLayout={(event) => {
          // While expanded the visible text is the full text — measuring it
          // would erase the clamped baseline and hide the "Read less" toggle.
          if (!expanded) setClampedHeight(event.nativeEvent.layout.height);
        }}
      >
        {text}
      </Text>
      <Text
        aria-hidden
        className="text-foreground/90 font-sans text-base leading-relaxed absolute top-0 left-0 right-0 opacity-0"
        onLayout={(event) => setFullHeight(event.nativeEvent.layout.height)}
        pointerEvents="none"
      >
        {text}
      </Text>
      {clampable && (
        <PresstableOpacity
          className="self-start mt-1.5"
          onPress={() => setExpanded(!expanded)}
        >
          <Text className="text-accent font-sans-semibold text-sm">
            {expanded ? 'Read less' : 'Read more'}
          </Text>
        </PresstableOpacity>
      )}
    </View>
  );
}

interface PersonCardProps {
  id: string;
  name: string;
  /** Character for cast, job title(s) for crew. */
  subtitle: string;
  headshot: string;
}

function PersonCard({ name, subtitle, headshot }: Omit<PersonCardProps, 'id'>) {
  return (
    <View className="w-24 items-center mr-4">
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
    </View>
  );
}

function PeopleSection({
  title,
  people,
}: {
  title: string;
  people: PersonCardProps[];
}) {
  if (people.length === 0) return null;

  return (
    <View className="mt-8">
      <Text className="text-xl font-display text-foreground mb-4">{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {people.map(({ id, ...person }) => (
          <PersonCard key={id} {...person} />
        ))}
      </ScrollView>
    </View>
  );
}

/** Cast + crew share one /people request, so they live under one boundary. */
function PeopleSections({
  type,
  traktId,
}: {
  type: MediaType;
  traktId: number;
}) {
  const { data } = useSuspenseTraktPeopleQuery({ type, traktId });

  return (
    <>
      <PeopleSection
        title="Cast"
        people={data.cast.map((member) => ({
          id: member.id,
          name: member.name,
          subtitle: member.character,
          headshot: member.headshot,
        }))}
      />
      <PeopleSection
        title="Crew"
        people={data.crew.map((member) => ({
          id: member.id,
          name: member.name,
          subtitle: member.job,
          headshot: member.headshot,
        }))}
      />
    </>
  );
}

/** One "Studios" pill list — both providers' sections render through this. */
function StudiosList({
  studios,
}: {
  studios: ReadonlyArray<{ id: string | number; name: string }>;
}) {
  if (studios.length === 0) return null;

  return (
    <View className="mt-8">
      <Text className="text-xl font-display text-foreground mb-4">
        Studios
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {studios.map((studio) => (
          <View
            className="bg-surface border border-border rounded-full px-4 py-2"
            key={studio.id}
          >
            <Text className="text-foreground font-sans text-sm">
              {studio.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StudiosSection({
  type,
  traktId,
}: {
  type: MediaType;
  traktId: number;
}) {
  const { data: studios } = useSuspenseTraktStudiosQuery({ type, traktId });
  return <StudiosList studios={studios} />;
}

/** AniList supplies people and studios from one public Media query. */
function AnimeCreditsSections({ anilistId }: { anilistId: number }) {
  const { data } = useSuspenseAniListCreditsQuery({ mediaId: anilistId });

  return (
    <>
      <PeopleSection
        title="Cast"
        people={data.cast.map((member) => ({
          id: member.id,
          name: member.name,
          subtitle: member.character,
          headshot: member.headshot,
        }))}
      />
      <PeopleSection
        title="Crew"
        people={data.crew.map((member) => ({
          id: member.id,
          name: member.name,
          subtitle: member.job,
          headshot: member.headshot,
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
  const feed = useUnifiedFeed();
  const queryClient = useQueryClient();
  const accent = useCSSVariable('--color-accent');
  const foreground = useCSSVariable('--color-foreground');
  // Bumped on pull-to-refresh so failed (unmounted) sections re-attempt.
  const [refreshCount, setRefreshCount] = useState(0);

  const item =
    findItemById(id, [
      // Personal feeds first: an item can appear in both "Your Anime" and
      // the seasonal anime row, and the personal copy carries real progress.
      feed.yourShows,
      feed.yourAnime,
      feed.trendingMovies,
      feed.trendingShows,
      feed.seasonalAnime,
    ]) ?? findInSearchCache(queryClient, id);
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

  const meta = metaLine(item);
  // "0 episodes" on a movie is noise — only show progress where it means
  // something (any TV/manga item, or a movie already logged at least once).
  const showProgress = item.type !== 'MOVIE' || item.currentProgress > 0;
  const displayedProgress =
    item.type === 'ANIME'
      ? (anilistEntry.data?.entry?.progress ?? item.currentProgress)
      : item.currentProgress;

  function refresh() {
    // Sections that failed are unmounted, leaving their queries inactive and
    // stuck in error state — remove those so the resetKey remount refetches
    // from scratch. Healthy (active) ones refetch in the background instead,
    // without re-suspending into a skeleton.
    if (traktId != null && item != null) {
      for (const key of [
        traktQueryKeys.people(item.type, traktId),
        traktQueryKeys.studios(item.type, traktId),
        ...(item.type === 'TV'
          ? [traktQueryKeys.seasons(traktId), traktQueryKeys.showProgress(traktId)]
          : []),
      ]) {
        queryClient.removeQueries({ queryKey: key, type: 'inactive' });
      }
    }
    if (anilistId != null && item?.type === 'ANIME') {
      for (const key of [
        anilistQueryKeys.entryState(anilistId),
        anilistQueryKeys.episodes(anilistId),
        anilistQueryKeys.credits(anilistId),
      ]) {
        queryClient.removeQueries({ queryKey: key, type: 'inactive' });
      }
    }
    setRefreshCount((count) => count + 1);
    return Promise.allSettled([
      feed.refetch(),
      queryClient.refetchQueries({ queryKey: traktQueryKeys.all, type: 'active' }),
      queryClient.refetchQueries({ queryKey: anilistQueryKeys.all, type: 'active' }),
    ]);
  }

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>{`${item.title} — Shinobu`}</title>
        {item.overview != null && (
          <meta content={item.overview} name="description" />
        )}
      </Head>
      <RefreshableScrollView className="flex-1" onRefresh={refresh}>
        <View className="h-80 relative">
          <Image
            source={{ uri: artwork.backdropImage || artwork.coverImage }}
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
            <Image
              source={{ uri: artwork.coverImage }}
              className="w-28 h-40 rounded-card border border-border bg-surface"
              contentFit="cover"
            />
            <View className="flex-1 ml-4 pb-1">
              <View className="flex-row items-center gap-3">
                <Text className="text-accent text-xs font-sans-semibold uppercase tracking-wider">
                  {item.type}
                </Text>
                {item.rating != null && (
                  <View className="flex-row items-center gap-1">
                    <Ionicons
                      color={typeof accent === 'string' ? accent : undefined}
                      name="star"
                      size={12}
                    />
                    <Text className="text-foreground text-xs font-sans-semibold">
                      {item.rating.toFixed(1)}
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-3xl font-display text-foreground mt-1">
                {item.title}
              </Text>
              {meta !== '' && (
                <Text className="text-muted font-sans text-sm mt-1.5">
                  {meta}
                </Text>
              )}
              <WatchedLine item={item} />
            </View>
          </View>

          {item.overview != null && <Overview text={item.overview} />}

          <LogMediaButton item={item} />

          {showProgress && (
            <View className="flex-row gap-4">
              <StatTile
                label="Progress"
                value={displayedProgress}
                caption={
                  item.progressUnit === 'chapter' ? 'chapters' : 'episodes'
                }
              />
              {item.totalEpisodes != null && (
                <StatTile
                  label="Total"
                  value={item.totalEpisodes}
                  caption="episodes"
                />
              )}
              {item.type === 'TV' && <SeriesRuntimeTile item={item} />}
              {item.type === 'ANIME' && item.isFilm !== true &&
                item.totalEpisodes != null &&
                item.runtime != null && (
                  <StatTile
                    label="Total time"
                    value={formatRuntime(item.totalEpisodes * item.runtime)}
                    caption={`${item.runtime}m each`}
                  />
                )}
            </View>
          )}

          {item.type === 'TV' && <SeasonsSection item={item} />}
          {item.type === 'ANIME' && item.isFilm !== true && (
            <AnimeSeasonsSection item={item} resetKey={refreshCount} />
          )}

          {item.type === 'ANIME' && anilistId != null ? (
            <SuspenseSection
              fallback={
                <>
                  <PeopleSectionsSkeleton />
                  <StudiosSkeleton />
                </>
              }
              resetKey={refreshCount}
            >
              <AnimeCreditsSections anilistId={anilistId} />
            </SuspenseSection>
          ) : traktId != null ? (
            <>
              <SuspenseSection
                fallback={<PeopleSectionsSkeleton />}
                resetKey={refreshCount}
              >
                <PeopleSections traktId={traktId} type={item.type} />
              </SuspenseSection>
              <SuspenseSection
                fallback={<StudiosSkeleton />}
                resetKey={refreshCount}
              >
                <StudiosSection traktId={traktId} type={item.type} />
              </SuspenseSection>
            </>
          ) : null}
        </View>
      </RefreshableScrollView>

      <PresstableOpacity
        accessibilityLabel="Back"
        className="absolute top-12 left-4 w-10 h-10 rounded-full bg-surface/90 border border-border items-center justify-center"
        onPress={goBack}
      >
        <Ionicons
          color={typeof foreground === 'string' ? foreground : undefined}
          name="arrow-back"
          size={20}
        />
      </PresstableOpacity>
    </View>
  );
}
