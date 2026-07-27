import {
  useIsFetching,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { Effect } from 'effect';

import {
  computeUpNext,
  selectUpNextPool,
  UP_NEXT_WINDOW_DAYS,
} from '@/features/up-next/compute';
import type {
  AniListUpNextInput,
  ReleaseUpNextInput,
  TraktCalendarUpNextInput,
  TraktUpNextInput,
  UpNextData,
  UpNextInputs,
} from '@/features/up-next/types';
import { providersForFeed } from '@/lib/providers/routing';
import type { TraktCalendarRelease } from '@/lib/providers/trakt/normalize';
import type { ProviderId } from '@/lib/providers/types';
import {
  getMyMoviesCalendar,
  getMyShowsCalendar,
  getMyStreamingCalendar,
  getShowWatchedProgress,
  getWatchedShows,
  traktCalendarRange,
} from '@/lib/providers/trakt/reads';
import { useConnectedProviders } from '@/state/session';

import { fetchCurrentAnimeEntries } from './anilist';
import { fetchLetterboxdReleaseInputs } from './letterboxd';
import { cachedAniZipIds } from './mapping';
import { traktDeps, traktQueryKeys } from './trakt';
import { UP_NEXT_QUERY_ROOT } from './up-next-cache';

/**
 * The Up Next feed slot (plan 0019 U4): gathers the raw per-provider inputs
 * both home sections are computed from. Deliberately *raw* — `computeUpNext`
 * runs in the hook at render time, never in the `queryFn`, so `now` is never
 * frozen at fetch time and an episode airing while the app is open moves
 * sections on the next render (KTD-5).
 *
 * Effect stays inside the queryFn (the AGENTS.md containment boundary): no
 * `Effect<…>` appears in any hook signature here.
 */

export const upNextQueryKeys = {
  /** Shared root so the disconnect purge in `state/session` can't drift. */
  all: [...UP_NEXT_QUERY_ROOT],
  /** The gathered provider inputs — what `invalidateAfterLog` refreshes. */
  inputs: () => [...upNextQueryKeys.all, 'inputs'] as const,
};

/**
 * Per-show progress moves only when the user logs something, and a log already
 * invalidates `showProgress(id)` explicitly — so between logs these reads ride
 * the cache instead of re-spending the pooled request budget on every home
 * mount (same reasoning as the feed's `CATALOGUE_STALE_MS`).
 */
const SHOW_PROGRESS_STALE_MS = 15 * 60_000;

/**
 * The watched-shows list is also the "Your Shows" feed slot; this window keeps
 * the pool selection off the wire when that row just loaded it.
 */
const WATCHED_SHOWS_STALE_MS = 60_000;

/**
 * How many pooled progress requests are in flight at once. Bounded because the
 * pool is a fan of authed calls, not because any single one is slow — a burst
 * of 20 is exactly the shape rate limiters punish.
 */
const PROGRESS_CONCURRENCY = 4;

/** ani.zip lookups are cached forever, so this only bounds the cold burst. */
const MAPPING_CONCURRENCY = 4;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Continue Watching's Trakt source: pool first (KTD-2), then one
 * `next_episode`-bearing progress call per pooled show. A single show's failure
 * omits that show — never the section. Since plan 0030 this fan answers for the
 * aired half only; Calendar reads the my-calendars endpoints below.
 */
async function traktInputs(queryClient: QueryClient): Promise<TraktUpNextInput[]> {
  const shows = await queryClient.fetchQuery({
    queryKey: traktQueryKeys.watchedShows(),
    queryFn: () => Effect.runPromise(getWatchedShows(traktDeps())),
    staleTime: WATCHED_SHOWS_STALE_MS,
  });

  const pool = selectUpNextPool(shows);
  const results = await Effect.runPromise(
    Effect.forEach(
      pool,
      (item) =>
        Effect.promise(async (): Promise<TraktUpNextInput | null> => {
          const traktId = item.externalIds.trakt;
          if (traktId == null) return null;
          try {
            const progress = await queryClient.fetchQuery({
              queryKey: traktQueryKeys.showProgress(traktId),
              queryFn: () =>
                Effect.runPromise(
                  getShowWatchedProgress(traktDeps(), { traktId }),
                ),
              staleTime: SHOW_PROGRESS_STALE_MS,
            });
            return {
              item,
              ...(progress.nextEpisode != null
                ? { nextEpisode: progress.nextEpisode }
                : {}),
            };
          } catch {
            return null;
          }
        }),
      { concurrency: PROGRESS_CONCURRENCY },
    ),
  );

  return results.filter((input): input is TraktUpNextInput => input != null);
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

/**
 * Calendar's Trakt half (KTD-2): one call covering every show the user watches
 * **or watchlists**, over exactly the window the section renders. This is what
 * replaced the pooled progress fan as the upcoming source — that fan caps at 20
 * shows and can only speak for shows already started, so a watchlisted premiere
 * could never reach Calendar through it.
 */
function traktCalendarInputs(
  queryClient: QueryClient,
): Promise<TraktCalendarUpNextInput[]> {
  const range = calendarRange();
  return queryClient.fetchQuery({
    queryKey: traktQueryKeys.myCalendar('shows', range.startDate, range.days),
    queryFn: () => Effect.runPromise(getMyShowsCalendar(traktDeps(), range)),
    staleTime: CALENDAR_STALE_MS,
  });
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
    queryKey: traktQueryKeys.myCalendar(
      calendar.type,
      range.startDate,
      range.days,
    ),
    queryFn: () => Effect.runPromise(calendar.read(traktDeps(), range)),
    staleTime: CALENDAR_STALE_MS,
  });
  return rows.map(releaseInput);
}

/** The normalized row plus the provider that stated it — see `ReleaseUpNextInput`. */
function releaseInput(release: TraktCalendarRelease): ReleaseUpNextInput {
  return {
    item: release.item,
    kind: release.kind,
    date: release.date,
    source: 'trakt',
  };
}

/**
 * AniList half: one widened list request (U2), plus — only when Trakt is also
 * connected, since dedupe is the sole consumer — a bounded ani.zip lookup per
 * pool anime to learn its TMDB id (R5). Every lookup is forever-cached and
 * degrades to "no id", which just leaves a duplicate card standing.
 */
/**
 * Only entries that can actually *produce* a card are worth an ani.zip lookup.
 * Widening the list read to PLANNING (U2) also widened the mapping fan below:
 * a 400-title plan-to-watch list would otherwise cost ~400 external lookups at
 * concurrency 4 — blocking the whole slot on its skeleton — to resolve dedupe
 * ids for entries the KTD-3 gate then discards anyway. A PLANNING entry only
 * survives that gate while it is still unaired, which is exactly the condition
 * `nextAiring` states.
 */
function worthMapping(entry: AniListUpNextInput): boolean {
  return entry.status !== 'PLANNING' || entry.nextAiring != null;
}

async function anilistInputs(
  queryClient: QueryClient,
  needsTmdbIds: boolean,
): Promise<AniListUpNextInput[]> {
  const entries = await fetchCurrentAnimeEntries(queryClient);
  if (!needsTmdbIds) return entries;

  const resolved = await Effect.runPromise(
    Effect.forEach(
      entries.filter(worthMapping),
      (entry) =>
        Effect.promise(async (): Promise<AniListUpNextInput> => {
          const known = entry.item.externalIds.tmdb;
          if (known != null) return { ...entry, tmdbId: known };
          const anilistId = entry.item.externalIds.anilist;
          if (anilistId == null) return entry;
          const mapped = await cachedAniZipIds(queryClient, { anilistId });
          return mapped?.tmdb != null ? { ...entry, tmdbId: mapped.tmdb } : entry;
        }),
      { concurrency: MAPPING_CONCURRENCY },
    ),
  );

  // The skipped entries still belong in the inputs — they simply carry no
  // resolved TMDB id, which is the same best-effort degradation an ani.zip
  // miss already produces (R5 leaves the duplicate card standing).
  return [...resolved, ...entries.filter((entry) => !worthMapping(entry))];
}

/**
 * Every source in parallel, each failing independently: a disconnected or
 * broken source contributes an error entry and zero inputs, and the others
 * still render (R4/R7 — the unified-feed partial-failure contract, not a
 * thrown slot). Each of the four Trakt reads settles *separately* on purpose —
 * down to the two movie calendars individually: a calendar outage must not take
 * Continue Watching down with it, and one calendar's outage must not take the
 * other's rows, which is precisely what folding them into one try block would
 * do.
 */
export async function fetchUpNextInputs(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
): Promise<UpNextInputs> {
  const feedProviders = providersForFeed(connected);
  const wantsTrakt = feedProviders.includes('trakt');
  const wantsAniList = feedProviders.includes('anilist');
  const wantsLetterboxd = feedProviders.includes('letterboxd');

  const [trakt, traktCalendar, movieCalendars, letterboxd, anilist] =
    await Promise.all([
      wantsTrakt
        ? settle('trakt', () => traktInputs(queryClient))
        : none<TraktUpNextInput>(),
      wantsTrakt
        ? settle('trakt', () => traktCalendarInputs(queryClient))
        : none<TraktCalendarUpNextInput>(),
      Promise.all(
        MOVIE_CALENDARS.map((calendar) =>
          wantsTrakt
            ? settle('trakt', () => traktReleaseInputs(queryClient, calendar))
            : none<ReleaseUpNextInput>(),
        ),
      ),
      wantsLetterboxd
        ? settle('letterboxd', () =>
            fetchLetterboxdReleaseInputs(queryClient, new Date()),
          )
        : none<ReleaseUpNextInput>(),
      wantsAniList
        ? settle('anilist', () => anilistInputs(queryClient, wantsTrakt))
        : none<AniListUpNextInput>(),
    ]);

  return {
    trakt: trakt.inputs,
    traktCalendar: traktCalendar.inputs,
    // One array, three sources: dedupe collapses a film watchlisted on both to
    // a single row per release kind (KTD-6), which is only possible because the
    // Letterboxd resolve attaches the TMDB id Trakt's rows already carry.
    releases: [
      ...movieCalendars.flatMap((calendar) => calendar.inputs),
      ...letterboxd.inputs,
    ],
    anilist: anilist.inputs,
    errors: [
      ...trakt.errors,
      ...traktCalendar.errors,
      ...movieCalendars.flatMap((calendar) => calendar.errors),
      ...letterboxd.errors,
      ...anilist.errors,
    ],
  };
}

interface ProviderContribution<Input> {
  inputs: Input[];
  errors: UpNextInputs['errors'];
}

/** A disconnected provider contributes nothing — and that is not an error. */
function none<Input>(): ProviderContribution<Input> {
  return { inputs: [], errors: [] };
}

/** One provider's contribution, with its failure captured instead of thrown. */
async function settle<Input>(
  provider: ProviderId,
  run: () => Promise<Input[]>,
): Promise<ProviderContribution<Input>> {
  try {
    return { inputs: await run(), errors: [] };
  } catch (error: unknown) {
    return { inputs: [], errors: [{ provider, message: errorMessage(error) }] };
  }
}

function upNextOptions(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
) {
  return {
    queryKey: upNextQueryKeys.inputs(),
    queryFn: () => fetchUpNextInputs(queryClient, connected),
  };
}

/**
 * Warm the slot without observing it — the app-foreground path (`UpNextPrefetch`).
 * `prefetchQuery` honours the client's `staleTime`, so returning to a still-fresh
 * app is a no-op rather than another run of the fan.
 */
export function prefetchUpNextInputs(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
): Promise<void> {
  return queryClient.prefetchQuery(upNextOptions(queryClient, connected));
}

export interface UpNextResult extends UpNextData {
  /** Providers whose inputs failed — the sections degrade, never blank (R4). */
  errors: UpNextInputs['errors'];
  /**
   * The clock this render's split was computed against — passed down so cards
   * label their badges from the same instant the sections were built from.
   */
  now: Date;
}

/**
 * Both Up Next sections, recomputed from cached inputs on every render.
 * Suspense variant — mount it under a `SuspenseSection` like every other feed
 * row (AGENTS.md "Loading & Error States").
 */
export function useSuspenseUpNextQuery(): UpNextResult {
  const queryClient = useQueryClient();
  const connected = useConnectedProviders();
  const { data } = useSuspenseQuery(upNextOptions(queryClient, connected));
  const now = new Date();
  return { ...computeUpNext(data, now), errors: data.errors, now };
}

/**
 * Whether the slot is currently refetching — the settle signal a quick-log
 * card waits on before advancing (KTD-6). `invalidateAfterLog` stays
 * fire-and-forget; this is how the card notices the refetch it triggered.
 */
export function useUpNextSettling(): boolean {
  return useIsFetching({ queryKey: upNextQueryKeys.inputs() }) > 0;
}
