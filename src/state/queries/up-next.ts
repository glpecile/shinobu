import {
  experimental_streamedQuery as streamedQuery,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import {
  computeUpNext,
  selectUpNextPool,
  UP_NEXT_WINDOW_DAYS,
  withinPremiereWindow,
} from '@/features/up-next/compute';
import type {
  AniListUpNextInput,
  CalendarUpNextInput,
  ProgressUpNextInput,
  ReleaseUpNextInput,
  UpNextData,
  UpNextInputs,
} from '@/features/up-next/types';
import { providersForFeed } from '@/lib/providers/routing';
import type {
  SimklCalendarEntry,
  SimklLibrary,
  SimklLibraryEntry,
  SimklNextToWatch,
} from '@/lib/providers/simkl/normalize';
import { getAllItems, getCalendar, type SimklCalendarKind } from '@/lib/providers/simkl/reads';
import type { TraktCalendarRelease } from '@/lib/providers/trakt/normalize';
import { Provider, type ProviderId } from '@/lib/providers/types';
import {
  getMyMoviesCalendar,
  getMyShowsCalendar,
  getMyStreamingCalendar,
  getShowWatchedProgress,
  getWatchedShows,
  traktCalendarRange,
} from '@/lib/providers/trakt/reads';
import { currentUsableProviders, useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import type { NormalizedMediaItem } from '@/types/media';

import { anilistQueryKeys, fetchCurrentAnimeEntries } from './anilist';
import { fetchLetterboxdReleaseInputs, letterboxdQueryKeys } from './letterboxd';
import { cachedAniZipIds } from './mapping';
import { none, settle, streamLegs } from './settle';
import { simklDeps, simklQueryKeys, simklWatchingLibraryQuery } from './simkl';
import { traktDeps, traktQueryKeys } from './trakt';
import { UP_NEXT_QUERY_ROOT } from './up-next-cache';
import { WATCHLIST_STALE_MS } from './watchlist';

/**
 * Cache the raw provider inputs so the render-time clock can move items between sections
 * without a refetch.
 */

export const upNextQueryKeys = {
  all: [...UP_NEXT_QUERY_ROOT],
  inputs: () => [...upNextQueryKeys.all, 'inputs'] as const,
};

/**
 * Per-show progress moves only when the user logs something, and a log already
 * invalidates `showProgress(id)` explicitly — so between logs these reads ride
 * the cache instead of re-spending the pooled request budget on every home
 * mount (same reasoning as the feed's `CATALOGUE_STALE_MS`).
 */
const SHOW_PROGRESS_STALE_MS = 15 * 60_000;

const WATCHED_SHOWS_STALE_MS = 60_000;

/**
 * How many pooled progress requests are in flight at once. Bounded because the
 * pool is a fan of authed calls, not because any single one is slow — a burst
 * of 20 is exactly the shape rate limiters punish.
 */
const PROGRESS_CONCURRENCY = 4;

/** ani.zip lookups are cached forever, so this only bounds the cold burst. */
const MAPPING_CONCURRENCY = 4;

/** Settle Trakt progress per show. Report a provider error if they all fail. */
async function traktInputs(queryClient: QueryClient): Promise<ProgressUpNextInput[]> {
  const shows = await queryClient.fetchQuery({
    queryKey: traktQueryKeys.watchedShows(),
    queryFn: ({ signal }) => Effect.runPromise(getWatchedShows(traktDeps()), { signal }),
    staleTime: WATCHED_SHOWS_STALE_MS,
  });

  const pool = selectUpNextPool(shows);
  let firstFailure: unknown;
  const results = await Effect.runPromise(
    Effect.forEach(
      pool,
      (item) =>
        Effect.promise(async (): Promise<ProgressUpNextInput | null> => {
          const traktId = item.externalIds.trakt;
          if (traktId == null) return null;
          try {
            const progress = await queryClient.fetchQuery({
              queryKey: traktQueryKeys.showProgress(traktId),
              queryFn: ({ signal }) =>
                Effect.runPromise(getShowWatchedProgress(traktDeps(), { traktId }), { signal }),
              staleTime: SHOW_PROGRESS_STALE_MS,
            });
            // Behind-count from the same response: `aired` minus completed
            // keys — no extra request. Absent `aired` (pre-KTD4 cache) means
            // no count, not zero.
            const behind =
              progress.aired != null ? progress.aired - progress.watchedKeys.size : null;
            return {
              item,
              source: Provider.Trakt,
              ...(progress.nextEpisode != null ? { nextEpisode: progress.nextEpisode } : {}),
              ...(behind != null && behind > 0 ? { episodesBehind: behind } : {}),
            };
          } catch (error) {
            firstFailure ??= error;
            return null;
          }
        }),
      { concurrency: PROGRESS_CONCURRENCY },
    ),
  );

  const inputs = results.filter((input): input is ProgressUpNextInput => input != null);
  if (inputs.length === 0 && firstFailure !== undefined) throw firstFailure;
  return inputs;
}

/**
 * A calendar answers for a whole week and only moves when a broadcaster does,
 * so this window keeps every Up Next mount off the wire. Staleness can't
 * outlive the day either way: the key carries the local start date (see
 * `traktQueryKeys.myCalendar`).
 */
const CALENDAR_STALE_MS = 15 * 60_000;

/**
 * The window every calendar read asks for, resolved here rather than left to
 * the read's own default so the cache key names exactly the range requested.
 */
function calendarRange() {
  return traktCalendarRange({ days: UP_NEXT_WINDOW_DAYS }, new Date());
}

/** One Trakt calendar read covers watched and watchlisted shows for the displayed window. */
async function traktCalendarInputs(queryClient: QueryClient): Promise<CalendarUpNextInput[]> {
  const range = calendarRange();
  const rows = await queryClient.fetchQuery({
    queryKey: traktQueryKeys.myCalendar('shows', range.startDate, range.days),
    queryFn: ({ signal }) => Effect.runPromise(getMyShowsCalendar(traktDeps(), range), { signal }),
    staleTime: CALENDAR_STALE_MS,
  });
  // Tagged outside the queryFn so the cache keeps holding the provider-shaped
  // rows (`TraktCalendarEpisode[]`) it always has — same idiom as the release
  // legs' `releaseInput` mapping.
  return rows.map((row) => ({ ...row, source: Provider.Trakt }));
}

/**
 * Theatrical and digital are two calendars because they are two events (R3) —
 * a film out in cinemas Friday and streaming next month is two rows with two
 * dates, not one row that moves. `/calendars/my/dvd` is deliberately not
 * requested: physical rows don't render in v1, so the call would buy nothing.
 */
const MOVIE_CALENDARS = [
  { type: 'movies', read: getMyMoviesCalendar },
  { type: 'streaming', read: getMyStreamingCalendar },
] as const;

type MovieCalendar = (typeof MOVIE_CALENDARS)[number];

/**
 * One movie calendar's rows as release inputs. Deliberately *one* calendar per
 * call so `fetchUpNextInputs` can settle each separately (R7):
 * `/calendars/my/streaming` is the single path plan 0030 could not confirm
 * against an authed response (docs/solutions/trakt-streaming-calendar-path.md,
 * KTD-4's fallback), and folding it into the same try block as
 * `/calendars/my/movies` would let that one uncertain endpoint delete every
 * theatrical row too. A missing streaming row is a gap the fallback covers; the
 * theatrical rows disappearing with it is the section failing quietly.
 */
async function traktReleaseInputs(
  queryClient: QueryClient,
  calendar: MovieCalendar,
): Promise<ReleaseUpNextInput[]> {
  const range = calendarRange();
  const rows = await queryClient.fetchQuery({
    queryKey: traktQueryKeys.myCalendar(calendar.type, range.startDate, range.days),
    queryFn: ({ signal }) => Effect.runPromise(calendar.read(traktDeps(), range), { signal }),
    staleTime: CALENDAR_STALE_MS,
  });
  return rows.map(releaseInput);
}

function releaseInput(release: TraktCalendarRelease): ReleaseUpNextInput {
  return {
    item: release.item,
    kind: release.kind,
    date: release.date,
    source: Provider.Trakt,
  };
}

/** The Simkl CDN files are about 1.5 MB and carry five-hour upstream cache headers. */
const SIMKL_CALENDAR_STALE_MS = 60 * 60_000;

/**
 * The `watching` snapshot: Continue Watching's Simkl source. The query
 * definition lives in `simkl.ts` (`simklWatchingLibraryQuery`) so the details
 * screen's per-show entry hook shares this exact cache entry.
 */
function simklWatchingLibrary(queryClient: QueryClient): Promise<SimklLibrary> {
  return queryClient.fetchQuery(simklWatchingLibraryQuery());
}

/**
 * The `plantowatch` snapshot — the watchlisted half of KTD-4's tracked set.
 * Deliberately the watchlist gatherer's own cache entry (same key, same
 * window): when both surfaces gather in one session, the second read is free.
 */
function simklPlannedLibrary(queryClient: QueryClient): Promise<SimklLibrary> {
  return queryClient.fetchQuery({
    queryKey: simklQueryKeys.allItems(undefined, 'plantowatch'),
    queryFn: ({ signal }) =>
      Effect.runPromise(getAllItems(simklDeps(), { status: 'plantowatch' }), { signal }),
    staleTime: WATCHLIST_STALE_MS,
  });
}

/**
 * Aired-but-unwatched count from the snapshot's own fields (`total - notAired
 * - watched`), or null when the counts are absent — the arithmetic both the
 * aired-by-count gate and the behind badge read.
 */
function simklEpisodesBehind(entry: SimklLibraryEntry): number | null {
  const total = entry.item.totalEpisodes;
  const notAired = entry.notAiredEpisodes;
  if (total == null || notAired == null) return null;
  return total - notAired - entry.item.currentProgress;
}

/**
 * Whether the entry's own counts prove its `nextToWatch` pointer aired: the
 * user has watched fewer episodes than have aired, so the next unwatched one
 * is out by arithmetic — no instant needed. This is the null-date pointer's
 * only path to "aired": a caught-up show whose undated next episode is
 * genuinely in the future computes behind 0 here and stays excluded, exactly
 * like Trakt's null-instant rule.
 */
function simklAiredByCount(entry: SimklLibraryEntry): boolean {
  return (simklEpisodesBehind(entry) ?? 0) > 0;
}

/** When the progress snapshot has no next pointer, use the aired calendar entry. */
function calendarPointer(
  entry: SimklLibraryEntry,
  airingsByShow: ReadonlyMap<number, SimklCalendarEntry[]>,
): SimklNextToWatch | undefined {
  const simklId = entry.item.externalIds.simkl;
  const airings = simklId == null ? [] : (airingsByShow.get(simklId) ?? []);
  const [next] = airings
    .filter(
      (airing) =>
        airing.episode != null &&
        // Simkl's own pointer never names a special.
        airing.episode.season !== 0 &&
        // Anime airings are seasonless; the snapshot files them under season 1.
        !entry.watchedKeys.has(`${airing.episode.season ?? 1}-${airing.episode.number}`),
    )
    .sort(
      (a, b) => a.date.localeCompare(b.date) || (a.episode?.number ?? 0) - (b.episode?.number ?? 0),
    );
  if (next?.episode == null) return undefined;
  return {
    ...(next.episode.season != null ? { season: next.episode.season } : {}),
    episode: next.episode.number,
    ...(next.episode.title != null ? { title: next.episode.title } : {}),
    date: next.date,
  };
}

function simklProgressInput(
  entry: SimklLibraryEntry,
  airingsByShow: ReadonlyMap<number, SimklCalendarEntry[]>,
): ProgressUpNextInput {
  const next = entry.nextToWatch ?? calendarPointer(entry, airingsByShow);
  if (next == null) return { item: entry.item, source: Provider.Simkl };
  const behind = simklEpisodesBehind(entry);
  return {
    item: entry.item,
    source: Provider.Simkl,
    nextEpisode: {
      ...(next.season != null ? { season: next.season } : {}),
      number: next.episode,
      ...(next.title != null ? { title: next.title } : {}),
      // The `next_watch_info` air instant verbatim, or null when Simkl has
      // none — never a reformatted or guessed date (the has-aired contract).
      firstAired: next.date,
    },
    ...(next.date == null && simklAiredByCount(entry) ? { nextEpisodeAiredByCount: true } : {}),
    ...(behind != null && behind > 0 ? { episodesBehind: behind } : {}),
  };
}

/**
 * Whether a `plantowatch` row has actually been **started** — the gate on the
 * parked half below. Simkl's plan-to-watch bucket is the watchlist, so an
 * un-started row there is something the user has decided to watch, not
 * something waiting one tap away; admitting the whole bucket would pour the
 * backlog into Continue Watching, which is exactly what `anilistEntry`'s
 * PLANNING gate exists to prevent on the other provider. A non-zero progress is
 * the one thing that distinguishes the two, and it is the same fact the details
 * screen renders as "10 / 20 episodes".
 */
function startedInSimkl(entry: SimklLibraryEntry): boolean {
  return entry.item.currentProgress > 0;
}

/** A pre-release watchlist entry can surface its premiere even before the first watch. */
function recentlyReleased(entry: SimklLibraryEntry, now: Date): boolean {
  return withinPremiereWindow(entry.nextToWatch?.date, now);
}

/** Simkl supplies next-episode pointers with air times in one library snapshot. */
async function simklInputs(queryClient: QueryClient): Promise<ProgressUpNextInput[]> {
  const [watching, parked] = await Promise.all([
    simklWatchingLibrary(queryClient),
    // Swallowed, not hidden: the calendar and releases legs read this same
    // snapshot and settle their own failure into `errors`, so the outage still
    // reaches the user — it just doesn't take `watching`'s rows down with it.
    simklPlannedLibrary(queryClient).catch(() => null),
  ]);
  const now = new Date();
  const parkedEntries =
    parked == null
      ? []
      : [...parked.shows, ...parked.anime].filter(
          (entry) => startedInSimkl(entry) || recentlyReleased(entry, now),
        );
  const entries = [...watching.shows, ...watching.anime, ...parkedEntries];
  const airings = entries.some((entry) => entry.nextToWatch == null)
    ? await Promise.all([
        simklCalendarFile(queryClient, 'tv'),
        simklCalendarFile(queryClient, 'anime'),
      ]).then(
        (files) => files.flat(),
        () => [],
      )
    : [];
  const airingsByShow = new Map<number, SimklCalendarEntry[]>();
  for (const airing of airings) {
    const bucket = airingsByShow.get(airing.simklId);
    if (bucket == null) airingsByShow.set(airing.simklId, [airing]);
    else bucket.push(airing);
  }
  return entries.map((entry) => simklProgressInput(entry, airingsByShow));
}

function simklCalendarFile(
  queryClient: QueryClient,
  kind: SimklCalendarKind,
): Promise<SimklCalendarEntry[]> {
  return queryClient.fetchQuery({
    queryKey: simklQueryKeys.calendar(kind),
    queryFn: ({ signal }) => Effect.runPromise(getCalendar(simklDeps(), kind), { signal }),
    staleTime: SIMKL_CALENDAR_STALE_MS,
    // No observer holds it, so the default five minutes would evict it and
    // re-download the file on the next Up Next recompute.
    gcTime: SIMKL_CALENDAR_STALE_MS,
  });
}

/** Combine watching and plan-to-watch ids for Simkl's client-side calendar. */
async function simklTrackedItems(queryClient: QueryClient): Promise<{
  episodes: Map<number, NormalizedMediaItem>;
  movies: Map<number, NormalizedMediaItem>;
}> {
  const [planned, watching] = await Promise.all([
    simklPlannedLibrary(queryClient),
    simklWatchingLibrary(queryClient),
  ]);
  const episodes = new Map<number, NormalizedMediaItem>();
  const movies = new Map<number, NormalizedMediaItem>();
  // Planned first so a watching row wins the (theoretical) collision — its
  // `lastUpdated` is the fresher of the two.
  for (const library of [planned, watching]) {
    for (const entry of [...library.shows, ...library.anime]) {
      const simklId = entry.item.externalIds.simkl;
      if (simklId != null) episodes.set(simklId, entry.item);
    }
    for (const entry of library.movies) {
      const simklId = entry.item.externalIds.simkl;
      if (simklId != null) movies.set(simklId, entry.item);
    }
  }
  return { episodes, movies };
}

/**
 * Calendar's Simkl half (KTD-4): the rolling tv + anime CDN files intersected
 * client-side with the user's tracked ids — there is no server-side "my
 * calendar" on Simkl. An entry for a show the user doesn't track contributes
 * nothing, which is the entire intersection contract; a tracked show absent
 * from the files degrades to whatever the progress leg states (never hidden).
 * Air instants are the files' UTC `date` fields **verbatim** — `hasAired`
 * compares instants, so no localization happens here.
 */
async function simklCalendarInputs(queryClient: QueryClient): Promise<CalendarUpNextInput[]> {
  // Start the CDN reads with the library reads. Ignore calendar errors when the library has no
  // tracked ids.
  const files = Promise.all([
    simklCalendarFile(queryClient, 'tv'),
    simklCalendarFile(queryClient, 'anime'),
  ]);
  files.catch(() => {});
  const tracked = await simklTrackedItems(queryClient);
  if (tracked.episodes.size === 0) return [];
  const [tv, anime] = await files;
  return [...tv, ...anime].flatMap((entry): CalendarUpNextInput[] => {
    const item = tracked.episodes.get(entry.simklId);
    if (item == null || entry.episode == null) return [];
    return [
      {
        item,
        source: Provider.Simkl,
        episode: {
          ...(entry.episode.season != null ? { season: entry.episode.season } : {}),
          number: entry.episode.number,
          ...(entry.episode.title != null ? { title: entry.episode.title } : {}),
          firstAired: entry.date,
        },
        ...(entry.finaleType != null ? { finale: entry.finaleType } : {}),
      },
    ];
  });
}

/** Intersect Simkl's rolling movie-release file with the member's tracked movies. */
async function simklReleaseInputs(queryClient: QueryClient): Promise<ReleaseUpNextInput[]> {
  const file = simklCalendarFile(queryClient, 'movie_release');
  file.catch(() => {});
  const tracked = await simklTrackedItems(queryClient);
  if (tracked.movies.size === 0) return [];
  const rows = await file;
  return rows.flatMap((entry): ReleaseUpNextInput[] => {
    const item = tracked.movies.get(entry.simklId);
    if (item == null) return [];
    return [
      {
        item,
        kind: 'theatrical',
        date: entry.date.slice(0, 10),
        source: Provider.Simkl,
      },
    ];
  });
}

/**
 * AniList half: one widened list request (U2), plus — only when a tracker
 * (Trakt or Simkl) is also connected, since dedupe is the sole consumer — a
 * bounded ani.zip lookup per pool anime to learn its TMDB id (R5). Every
 * lookup is forever-cached and degrades to "no id", which just leaves a
 * duplicate card standing.
 */
/**
 * Map only AniList entries that can produce a card, keeping the fan-out bounded on large
 * plan-to-watch lists.
 */
function worthMapping(entry: AniListUpNextInput, now: Date): boolean {
  return (
    entry.status !== 'PLANNING' ||
    entry.nextAiring != null ||
    withinPremiereWindow(entry.firstAired, now)
  );
}

async function anilistInputs(
  queryClient: QueryClient,
  needsTmdbIds: boolean,
): Promise<AniListUpNextInput[]> {
  const entries = await fetchCurrentAnimeEntries(queryClient);
  if (!needsTmdbIds) return entries;
  const now = new Date();

  const resolved = await Effect.runPromise(
    Effect.forEach(
      entries.filter((entry) => worthMapping(entry, now)),
      (entry) =>
        Effect.promise(async (): Promise<AniListUpNextInput> => {
          const known = entry.item.externalIds.tmdb;
          if (known != null) return { ...entry, tmdbId: known };
          const anilistId = entry.item.externalIds.anilist;
          if (anilistId == null) return entry;
          const mapped = await cachedAniZipIds(queryClient, { anilistId });
          if (mapped == null) return entry;
          // Every mapped id rides along, not just TMDB: Simkl's anime calendar
          // often states tvdb/imdb/mal but no tmdb, and the cross-provider
          // dedupe (plan 0034 U9.5) joins on any shared identity key.
          return {
            ...entry,
            ...(mapped.tmdb != null ? { tmdbId: mapped.tmdb } : {}),
            item: {
              ...entry.item,
              externalIds: {
                ...entry.item.externalIds,
                ...(mapped.tmdb != null ? { tmdb: mapped.tmdb } : {}),
                ...(mapped.tvdb != null ? { tvdb: mapped.tvdb } : {}),
                ...(mapped.imdb != null ? { imdb: mapped.imdb } : {}),
              },
            },
          };
        }),
      { concurrency: MAPPING_CONCURRENCY },
    ),
  );

  return [...resolved, ...entries.filter((entry) => !worthMapping(entry, now))];
}

/** Settle provider reads independently so an outage leaves other sections available. */
function streamUpNextInputs(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
): AsyncGenerator<UpNextInputs> {
  const feedProviders = providersForFeed(connected);
  const wantsTrakt = feedProviders.includes(Provider.Trakt);
  const wantsSimkl = feedProviders.includes(Provider.Simkl);
  const wantsAniList = feedProviders.includes(Provider.AniList);
  const wantsLetterboxd = feedProviders.includes(Provider.Letterboxd);
  const [movies, streaming] = MOVIE_CALENDARS;

  return streamLegs(
    [
      wantsTrakt
        ? settle(Provider.Trakt, () => traktInputs(queryClient))
        : none<ProgressUpNextInput>(),
      wantsTrakt
        ? settle(Provider.Trakt, () => traktCalendarInputs(queryClient))
        : none<CalendarUpNextInput>(),
      wantsTrakt
        ? settle(Provider.Trakt, () => traktReleaseInputs(queryClient, movies))
        : none<ReleaseUpNextInput>(),
      wantsTrakt
        ? settle(Provider.Trakt, () => traktReleaseInputs(queryClient, streaming))
        : none<ReleaseUpNextInput>(),
      wantsSimkl
        ? settle(Provider.Simkl, () => simklInputs(queryClient))
        : none<ProgressUpNextInput>(),
      wantsSimkl
        ? settle(Provider.Simkl, () => simklCalendarInputs(queryClient))
        : none<CalendarUpNextInput>(),
      wantsSimkl
        ? settle(Provider.Simkl, () => simklReleaseInputs(queryClient))
        : none<ReleaseUpNextInput>(),
      wantsLetterboxd
        ? settle(Provider.Letterboxd, () => fetchLetterboxdReleaseInputs(queryClient, new Date()))
        : none<ReleaseUpNextInput>(),
      wantsAniList
        ? settle(Provider.AniList, () => anilistInputs(queryClient, wantsTrakt || wantsSimkl))
        : none<AniListUpNextInput>(),
    ],
    (legs) => {
      const [
        trakt,
        traktCalendar,
        traktMovies,
        traktStreaming,
        simklProgress,
        simklCalendar,
        simklReleases,
        letterboxd,
        anilist,
      ] = legs.map((leg) => leg ?? none()) as {
        [K in keyof typeof legs]: NonNullable<(typeof legs)[K]>;
      };
      return {
        progress: [...trakt.inputs, ...simklProgress.inputs],
        calendar: [...traktCalendar.inputs, ...simklCalendar.inputs],
        // Merge by release kind so multiple providers can describe the same film without
        // merging distinct theater and digital releases.
        releases: [
          ...simklReleases.inputs,
          ...traktMovies.inputs,
          ...traktStreaming.inputs,
          ...letterboxd.inputs,
        ],
        anilist: anilist.inputs,
        errors: [
          ...trakt.errors,
          ...traktCalendar.errors,
          ...traktMovies.errors,
          ...traktStreaming.errors,
          ...simklProgress.errors,
          ...simklCalendar.errors,
          ...simklReleases.errors,
          ...letterboxd.errors,
          ...anilist.errors,
        ],
      };
    },
    (partial) =>
      partial.progress.length +
        partial.calendar.length +
        partial.releases.length +
        partial.anilist.length >
      0,
  );
}

const NO_UP_NEXT_INPUTS: UpNextInputs = {
  progress: [],
  calendar: [],
  releases: [],
  anilist: [],
  errors: [],
};

export async function fetchUpNextInputs(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
): Promise<UpNextInputs> {
  let inputs = NO_UP_NEXT_INPUTS;
  for await (const partial of streamUpNextInputs(queryClient, connected)) inputs = partial;
  return inputs;
}

/**
 * A cold slot streams: the sections render once the first source with inputs
 * settles, and the rest join as they arrive. `replace` keeps a refetch on the
 * old inputs until every source is back, so a restored or refreshed slot never
 * shrinks to a partial one.
 * Each fetch reads `currentUsableProviders` when it starts.
 */
export function upNextOptions(queryClient: QueryClient) {
  return {
    queryKey: upNextQueryKeys.inputs(),
    queryFn: streamedQuery<UpNextInputs, UpNextInputs>({
      // Reading the signal lets streamedQuery stop cache writes after a purge.
      streamFn: ({ signal: _signal }) => {
        return streamUpNextInputs(queryClient, currentUsableProviders());
      },
      reducer: (_previous, partial) => partial,
      initialValue: NO_UP_NEXT_INPUTS,
      refetchMode: 'replace',
    }),
  };
}

/**
 * Warm the slot without observing it — the app-foreground path (`UpNextPrefetch`).
 * `prefetchQuery` honours the client's `staleTime`, so returning to a still-fresh
 * app is a no-op rather than another run of the fan.
 */
export function prefetchUpNextInputs(queryClient: QueryClient): Promise<void> {
  return queryClient.prefetchQuery(upNextOptions(queryClient));
}

/**
 * Mark the source queries stale before refreshing the gather. Otherwise their fetches can
 * reuse cached data.
 */
export async function refreshUpNextInputs(queryClient: QueryClient): Promise<void> {
  const username = getLetterboxdUsername();
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.watchedShows() }),
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.showProgress(0).slice(0, -1) }),
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.myCalendarRoot() }),
    queryClient.invalidateQueries({ queryKey: simklQueryKeys.allItemsRoot() }),
    queryClient.invalidateQueries({ queryKey: anilistQueryKeys.currentAnimeEntries() }),
    ...(username == null
      ? []
      : [queryClient.invalidateQueries({ queryKey: letterboxdQueryKeys.watchlist(username) })]),
  ]);
  await queryClient.refetchQueries({ queryKey: upNextQueryKeys.inputs() });
}

export interface UpNextResult extends UpNextData {
  errors: UpNextInputs['errors'];
  /**
   * The clock this render's split was computed against — passed down so cards
   * label their badges from the same instant the sections were built from.
   */
  now: Date;
}

/**
 * Both Up Next sections, computed from cached inputs against the caller's
 * `now` — clock state the caller refreshes (`UpNextSection`), so an airing
 * moves sections without a refetch. Suspense variant — mount it under a `SuspenseSection` like every other feed
 * row (AGENTS.md "Loading & Error States").
 */
export function useSuspenseUpNextQuery(now: Date): UpNextResult {
  const queryClient = useQueryClient();
  // Re-renders on a session change, which rebinds the observer to a rebuilt
  // query after `purgeProviderQueries` removes this one; observers aren't told.
  useConnectedProviders();
  const { data } = useSuspenseQuery(upNextOptions(queryClient));
  return { ...computeUpNext(data, now), errors: data.errors, now };
}
