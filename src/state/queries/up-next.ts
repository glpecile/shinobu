import {
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
} from '@/lib/providers/simkl/normalize';
import {
  getAllItems,
  getCalendar,
  type SimklCalendarKind,
} from '@/lib/providers/simkl/reads';
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
import { parseLocalInstant } from '@/lib/time/has-aired';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import { fetchCurrentAnimeEntries } from './anilist';
import { fetchLetterboxdReleaseInputs } from './letterboxd';
import { cachedAniZipIds } from './mapping';
import { none, settle } from './settle';
import { simklDeps, simklQueryKeys, simklWatchingLibraryQuery } from './simkl';
import { traktDeps, traktQueryKeys } from './trakt';
import { UP_NEXT_QUERY_ROOT } from './up-next-cache';
import { WATCHLIST_STALE_MS } from './watchlist';

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

/**
 * Continue Watching's Trakt source: pool first (KTD-2), then one
 * `next_episode`-bearing progress call per pooled show. A single show's failure
 * omits that show — never the section. Since plan 0030 this fan answers for the
 * aired half only; Calendar reads the my-calendars endpoints below.
 */
async function traktInputs(
  queryClient: QueryClient,
): Promise<ProgressUpNextInput[]> {
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
        Effect.promise(async (): Promise<ProgressUpNextInput | null> => {
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
              source: 'trakt',
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

  return results.filter((input): input is ProgressUpNextInput => input != null);
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
async function traktCalendarInputs(
  queryClient: QueryClient,
): Promise<CalendarUpNextInput[]> {
  const range = calendarRange();
  const rows = await queryClient.fetchQuery({
    queryKey: traktQueryKeys.myCalendar('shows', range.startDate, range.days),
    queryFn: () => Effect.runPromise(getMyShowsCalendar(traktDeps(), range)),
    staleTime: CALENDAR_STALE_MS,
  });
  // Tagged outside the queryFn so the cache keeps holding the provider-shaped
  // rows (`TraktCalendarEpisode[]`) it always has — same idiom as the release
  // legs' `releaseInput` mapping.
  return rows.map((row) => ({ ...row, source: 'trakt' as const }));
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
 * How long the parsed CDN calendar files ride the cache. The files are ~1.5 MB
 * with 5-hour upstream cache headers and move only when a broadcaster does
 * (plan 0034 KTD-4: "fetch it once per staleTime window and keep the parsed
 * result in the query cache") — an hour keeps every Up Next mount and
 * foreground prefetch off a megabyte-class download while still catching a
 * same-day schedule change.
 */
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
    queryFn: () =>
      Effect.runPromise(getAllItems(simklDeps(), { status: 'plantowatch' })),
    staleTime: WATCHLIST_STALE_MS,
  });
}

/**
 * Whether the entry's own counts prove its `nextToWatch` pointer aired: the
 * user has watched fewer episodes than have aired (`total - notAired`), so the
 * next unwatched one is out by arithmetic — no instant needed. This is the
 * null-date pointer's only path to "aired": a caught-up show whose undated
 * next episode is genuinely in the future computes `watched === aired` here
 * and stays excluded, exactly like Trakt's null-instant rule.
 */
function simklAiredByCount(entry: SimklLibraryEntry): boolean {
  const total = entry.item.totalEpisodes;
  const notAired = entry.notAiredEpisodes;
  if (total == null || notAired == null) return false;
  return entry.item.currentProgress < total - notAired;
}

function simklProgressInput(entry: SimklLibraryEntry): ProgressUpNextInput {
  const next = entry.nextToWatch;
  if (next == null) return { item: entry.item, source: 'simkl' };
  return {
    item: entry.item,
    source: 'simkl',
    nextEpisode: {
      ...(next.season != null ? { season: next.season } : {}),
      number: next.episode,
      ...(next.title != null ? { title: next.title } : {}),
      // The `next_watch_info` air instant verbatim, or null when Simkl has
      // none — never a reformatted or guessed date (the has-aired contract).
      firstAired: next.date,
    },
    ...(next.date == null && simklAiredByCount(entry)
      ? { nextEpisodeAiredByCount: true }
      : {}),
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

/**
 * The premiere exception to `startedInSimkl` (owner report 2026-08-02): a show
 * watchlisted *before release* whose first episode just aired is precisely what
 * the user was waiting for — not backlog. Recency is the fact separating the
 * two: every backlog row's pointer aired long ago, while "it released" means
 * within days. The window matches the calendar's, so a premiere waits in
 * Continue Watching exactly as long as an upcoming episode would sit in
 * Calendar, then falls back out if the user never starts it.
 *
 * A *future*-dated pointer passes too, deliberately: admission is fetch-time
 * but classification is render-time (`computeUpNext` gets a live `now`, KTD-5),
 * so a premiere airing while the app is open surfaces on the next render
 * instead of waiting out the snapshot's staleTime. Unaired pointers produce no
 * entry, so admitting them early shows nothing early. Date-less pointers stay
 * out: with no instant, "recent" is unknowable, and `simklAiredByCount` would
 * otherwise classify the user's whole fully-aired backlog as aired.
 */
const PREMIERE_ADMIT_WINDOW_MS = UP_NEXT_WINDOW_DAYS * 24 * 60 * 60_000;

function recentlyReleased(entry: SimklLibraryEntry, now: Date): boolean {
  const date = entry.nextToWatch?.date;
  if (date == null) return false;
  const instant = parseLocalInstant(date);
  if (instant == null) return false;
  return now.getTime() - instant.getTime() <= PREMIERE_ADMIT_WINDOW_MS;
}

/**
 * Continue Watching's Simkl source (plan 0034 U8/R9): the server-computed
 * `next_to_watch` pointers, air instants included (`next_watch_info=yes`) — one
 * call per snapshot, no per-show fan, which is why there is no Simkl analog of
 * the pool cap. Shows + anime only: a movie has no next episode.
 *
 * **The parked half (owner report 2026-08-01, overturning plan 0034 U8/R9).**
 * This leg used to read `watching` only, on the rationale that it mirrored
 * Trakt — whose watchlist reaches Up Next through the calendar leg and never the
 * progress pool — and that Simkl populates `next_watch_info` for `watching`
 * items alone. Both halves of that turned out to be wrong for Simkl. It holds
 * **one status per item**, so a show the user is part-way through but has parked
 * back on the watchlist lives in `plantowatch` and *nowhere else* — unlike
 * Trakt, where watchlisting a show never displaces its watch history. And Simkl
 * does populate `next_to_watch_info` for those rows (verified on device, plan
 * 0036 U8). A 10-of-20 show was therefore missing from Continue Watching while
 * its own details screen offered "Log S2E1", which is the same contradiction
 * `docs/solutions/simkl-parked-shows-have-no-next-to-watch.md` names from the
 * details side.
 *
 * Only *started* rows join (`startedInSimkl`) — plus just-premiered ones
 * (`recentlyReleased`, the 2026-08-02 report); the `plantowatch` read is
 * best-effort so a snapshot outage can't blank the `watching` rows this leg has
 * always carried, and it is the watchlist gather's own cache entry, so in the
 * common session it costs no request.
 *
 * Pre-window episodes (plan 0034 U8's open choice, resolved here): a pointer
 * whose episode aired before the rolling CDN window still classifies as aired
 * because its `next_watch_info` instant is simply a past instant — no archive
 * lookup needed. The `getMonthlyCalendar` archive fallback is **deliberately
 * not wired**: it would only serve pointers with a *null* date, and dating
 * those means guessing which month's ~MB file to fetch (the air date is
 * exactly the unknown). Those degrade to progress-only instead — the
 * `simklAiredByCount` arithmetic classifies them (it reads `totalEpisodes`,
 * `notAiredEpisodes` and `currentProgress`, which every status carries), and a
 * show the calendar file doesn't cover therefore still renders, never hidden.
 */
async function simklInputs(
  queryClient: QueryClient,
): Promise<ProgressUpNextInput[]> {
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
  return [...watching.shows, ...watching.anime, ...parkedEntries].map(
    simklProgressInput,
  );
}

/** One parsed rolling CDN calendar file, held for `SIMKL_CALENDAR_STALE_MS`. */
function simklCalendarFile(
  queryClient: QueryClient,
  kind: SimklCalendarKind,
): Promise<SimklCalendarEntry[]> {
  return queryClient.fetchQuery({
    queryKey: simklQueryKeys.calendar(kind),
    queryFn: () => Effect.runPromise(getCalendar(simklDeps(), kind)),
    staleTime: SIMKL_CALENDAR_STALE_MS,
  });
}

/**
 * The user's tracked Simkl items, keyed by Simkl id — the client side of
 * KTD-4's intersection (`watching` + `plantowatch`, the same watched-or-
 * watchlisted set Trakt's my-calendars answer for server-side). Split into
 * episode-bearing items and movies because the two calendar legs intersect
 * different files. Items come from the user's own library rather than the
 * file's metadata block: the library row is the one Simkl id the entry is
 * guaranteed to carry, and its metadata is what the user's other rows already
 * render (KTD-10 — a metadata-less calendar entry still shows).
 */
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
async function simklCalendarInputs(
  queryClient: QueryClient,
): Promise<CalendarUpNextInput[]> {
  const tracked = await simklTrackedItems(queryClient);
  // Nothing tracked means no row can survive the intersection — skip two
  // megabyte-class downloads that could only produce [].
  if (tracked.episodes.size === 0) return [];
  const [tv, anime] = await Promise.all([
    simklCalendarFile(queryClient, 'tv'),
    simklCalendarFile(queryClient, 'anime'),
  ]);
  return [...tv, ...anime].flatMap((entry): CalendarUpNextInput[] => {
    const item = tracked.episodes.get(entry.simklId);
    if (item == null || entry.episode == null) return [];
    return [
      {
        item,
        source: 'simkl',
        episode: {
          ...(entry.episode.season != null
            ? { season: entry.episode.season }
            : {}),
          number: entry.episode.number,
          ...(entry.episode.title != null
            ? { title: entry.episode.title }
            : {}),
          firstAired: entry.date,
        },
        ...(entry.finaleType != null ? { finale: entry.finaleType } : {}),
      },
    ];
  });
}

/**
 * The releases leg's Simkl half: the `movie_release` CDN file intersected with
 * the user's tracked movies, joining the same array as Trakt's two calendars
 * and Letterboxd's resolved watchlist (KTD-6 — dedupe needs the rows
 * together). Simkl states one undifferentiated release day per film (live
 * probe 2026-07-31: entries carry only `simkl_id` + an instant; the metadata
 * block's `release_date`/`dvd_date` mirror TMDB's fields), so it maps to
 * `theatrical` — the slot TMDB's own `release_date` fills — and the instant is
 * cut to its UTC calendar day because a release is a day, not an instant
 * (`UpNextRelease.date`). Where both trackers state the same `(film, kind)`,
 * Simkl's row wins by array order (`dedupeReleases` keeps the first one in —
 * KTD-10 precedence); Trakt's `digital` rows are a different kind and stand
 * regardless.
 */
async function simklReleaseInputs(
  queryClient: QueryClient,
): Promise<ReleaseUpNextInput[]> {
  const tracked = await simklTrackedItems(queryClient);
  if (tracked.movies.size === 0) return [];
  const rows = await simklCalendarFile(queryClient, 'movie_release');
  return rows.flatMap((entry): ReleaseUpNextInput[] => {
    const item = tracked.movies.get(entry.simklId);
    if (item == null) return [];
    return [
      {
        item,
        kind: 'theatrical',
        date: entry.date.slice(0, 10),
        source: 'simkl',
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

  // The skipped entries still belong in the inputs — they simply carry no
  // resolved TMDB id, which is the same best-effort degradation an ani.zip
  // miss already produces (R5 leaves the duplicate card standing).
  return [...resolved, ...entries.filter((entry) => !worthMapping(entry))];
}

/**
 * Every source in parallel, each failing independently: a disconnected or
 * broken source contributes an error entry and zero inputs, and the others
 * still render (R4/R7 — the unified-feed partial-failure contract, not a
 * thrown slot). Each tracker read settles *separately* on purpose — down to
 * the two Trakt movie calendars individually, and likewise Simkl's three legs:
 * a calendar outage must not take Continue Watching down with it, and one
 * calendar's outage must not take another's rows, which is precisely what
 * folding them into one try block would do.
 *
 * Trakt and Simkl are peers here (plan 0034 U8): each contributes to the same
 * provider-tagged `progress`/`calendar`/`releases` legs when connected, and
 * `computeUpNext` owns the cross-tracker collapse (KTD-10).
 */
export async function fetchUpNextInputs(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
): Promise<UpNextInputs> {
  const feedProviders = providersForFeed(connected);
  const wantsTrakt = feedProviders.includes('trakt');
  const wantsSimkl = feedProviders.includes('simkl');
  const wantsAniList = feedProviders.includes('anilist');
  const wantsLetterboxd = feedProviders.includes('letterboxd');

  const [
    trakt,
    traktCalendar,
    movieCalendars,
    simklProgress,
    simklCalendar,
    simklReleases,
    letterboxd,
    anilist,
  ] = await Promise.all([
    wantsTrakt
      ? settle('trakt', () => traktInputs(queryClient))
      : none<ProgressUpNextInput>(),
    wantsTrakt
      ? settle('trakt', () => traktCalendarInputs(queryClient))
      : none<CalendarUpNextInput>(),
    Promise.all(
      MOVIE_CALENDARS.map((calendar) =>
        wantsTrakt
          ? settle('trakt', () => traktReleaseInputs(queryClient, calendar))
          : none<ReleaseUpNextInput>(),
      ),
    ),
    wantsSimkl
      ? settle('simkl', () => simklInputs(queryClient))
      : none<ProgressUpNextInput>(),
    wantsSimkl
      ? settle('simkl', () => simklCalendarInputs(queryClient))
      : none<CalendarUpNextInput>(),
    wantsSimkl
      ? settle('simkl', () => simklReleaseInputs(queryClient))
      : none<ReleaseUpNextInput>(),
    wantsLetterboxd
      ? settle('letterboxd', () =>
          fetchLetterboxdReleaseInputs(queryClient, new Date()),
        )
      : none<ReleaseUpNextInput>(),
    wantsAniList
      ? settle('anilist', () =>
          anilistInputs(queryClient, wantsTrakt || wantsSimkl),
        )
      : none<AniListUpNextInput>(),
  ]);

  return {
    progress: [...trakt.inputs, ...simklProgress.inputs],
    calendar: [...traktCalendar.inputs, ...simklCalendar.inputs],
    // One array, four sources: dedupe collapses a film watchlisted in several
    // places to a single row per release kind (KTD-6), which is only possible
    // because every source's rows carry (or resolve) the same TMDB id. Simkl
    // first — `dedupeReleases` keeps the first row in per `(tmdb, kind)`, and
    // Simkl wins a metadata conflict (KTD-10/R10).
    releases: [
      ...simklReleases.inputs,
      ...movieCalendars.flatMap((calendar) => calendar.inputs),
      ...letterboxd.inputs,
    ],
    anilist: anilist.inputs,
    errors: [
      ...trakt.errors,
      ...traktCalendar.errors,
      ...movieCalendars.flatMap((calendar) => calendar.errors),
      ...simklProgress.errors,
      ...simklCalendar.errors,
      ...simklReleases.errors,
      ...letterboxd.errors,
      ...anilist.errors,
    ],
  };
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

