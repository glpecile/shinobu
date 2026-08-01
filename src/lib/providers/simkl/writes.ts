import { Effect } from 'effect';

import type { ProviderWriteResult } from '@/features/log-media/fan-out';
import type { AniZipEpisodeMap } from '@/lib/providers/mapping/anizip';
import { ProviderAuthError, ProviderDecodeError, type ProviderError } from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import type { SimklDeps } from './deps';
import { simklHttp } from './http';
import type { SimklLibrary, SimklLibraryEntry } from './normalize';
import { getAllItems } from './reads';

const provider = 'simkl' as const;

/**
 * One item's worth of a Simkl history batch — deliberately the same fields the
 * `LOG_ADAPTERS` seam hands every adapter (`features/log-media/use-log-media.ts`),
 * so U6's wiring is a passthrough: `{ item, episode/episodes, entryEpisodes,
 * watchedAt }` plus the one Simkl-specific input, the ani.zip numbering table.
 *
 * `logToSimkl` takes an *array* of these (plan 0034 KTD-3): every Simkl write
 * endpoint takes arrays and Simkl serialises writes per user behind a
 * ~20-second lock, so everything one fan-out produces must land as ONE POST —
 * arrays, never loops.
 */
export interface SimklLogEntry {
  item: NormalizedMediaItem;
  /** A single canonical episode watch. Mutually exclusive with `episodes`. */
  episode?: { season: number; number: number };
  /** Canonical `{season, number}` episode batch (plan 0027's translated domain). */
  episodes?: Array<{ season: number; number: number }>;
  /**
   * AniList-entry-relative 1..n numbers (plan 0027 KTD2). For anime this is
   * the domain Simkl itself speaks — ani.zip's table keys are AniDB-entry
   * derived and Simkl numbers anime episodes by AniDB convention (plan 0034
   * KTD-6) — so when present these pass through verbatim and no remap runs.
   */
  entryEpisodes?: number[];
  /**
   * The ani.zip numbering table for this entry — the remap seam for a
   * *canonically*-numbered anime batch (a log started from a TMDB-shaped
   * details screen carries `{season, number}` pairs, not entry numbers).
   * Injected by the caller off the same cached lookup plan 0027 built for
   * Trakt/Serializd (`state/queries/mapping.ts`), so this module stays
   * fetch-free like every other writes.ts.
   */
  episodeMap?: AniZipEpisodeMap | null;
  /** ISO instant; omitted = Simkl records "now". */
  watchedAt?: string;
}

/** The id payload of one history/list entry — see `idsFor`. */
type SimklWriteIds = Record<string, number | string>;

function skip(reason: string): ProviderWriteResult {
  return { status: 'skipped', reason };
}

/** Which top-level array of a Simkl sync body an item files under. */
type SimklCategory = 'movies' | 'shows' | 'anime';

/**
 * An anime — series or film — always files under `anime[]` (plan 0034 U4
 * execution note (b)): Simkl keeps a distinct anime catalog, and a tmdb-keyed
 * `movies[]` entry for an anime film may not resolve to the same catalog item,
 * so films go movie-*shaped* (whole item, no seasons) but anime-*filed*.
 * `null` for a type routing.ts should never have sent here (MANGA).
 */
function categoryFor(item: NormalizedMediaItem): SimklCategory | null {
  if (item.type === 'ANIME') return 'anime';
  if (item.type === 'MOVIE') return 'movies';
  if (item.type === 'TV') return 'shows';
  return null;
}

/**
 * Id selection (plan 0034 KTD-6): Simkl's own id wins outright when known;
 * otherwise movies/TV write by `tmdb`/`imdb` and anime by `mal` — the AniDB/MAL
 * id space is what Simkl's anime catalog is keyed by, and `externalIds` carries
 * no `anidb` slot today, so `mal` is the whole anime tier. An anime with
 * neither falls back to the bridge ids the docs list as accepted write keys
 * (anilist/tmdb/imdb — "send every ID you have, Simkl picks the first that
 * resolves", api.simkl.org add-to-history, fetched 2026-07-31); Open Question 2
 * (are `anilist` ids honoured in writes?) makes that tier best-effort, which is
 * fine: an unresolved id comes back in `not_found`, never as a wrong match.
 */
function idsFor(item: NormalizedMediaItem): SimklWriteIds | null {
  const { simkl, tmdb, imdb, mal, anilist } = item.externalIds;
  if (simkl != null) return { simkl };
  if (item.type === 'ANIME') {
    if (mal != null) return { mal };
    if (anilist == null && tmdb == null && imdb == null) return null;
    return {
      ...(anilist != null ? { anilist } : {}),
      ...(tmdb != null ? { tmdb } : {}),
      ...(imdb != null ? { imdb } : {}),
    };
  }
  if (tmdb == null && imdb == null) return null;
  return { ...(tmdb != null ? { tmdb } : {}), ...(imdb != null ? { imdb } : {}) };
}

/**
 * Read the stored session or fail. There is deliberately no refresh path
 * (plan 0034 KTD-2 — no refresh grant exists), so an absent session is the
 * same terminal "reconnect Simkl" state a 401 maps to.
 */
function accessToken(deps: SimklDeps): Effect.Effect<string, ProviderAuthError> {
  const token = deps.tokens.get()?.accessToken;
  if (token == null || token === '') {
    return Effect.fail(new ProviderAuthError({ provider, refreshFailed: true }));
  }
  return Effect.succeed(token);
}

/**
 * Group a canonical batch into Simkl's `seasons[].episodes[]` shape — the same
 * one-request-per-show grouping the Trakt adapter does.
 */
function seasonsFor(
  batch: ReadonlyArray<{ season: number; number: number }>,
): Array<{ number: number; episodes: Array<{ number: number }> }> {
  const bySeason = new Map<number, number[]>();
  for (const { season, number } of batch) {
    const bucket = bySeason.get(season) ?? [];
    bucket.push(number);
    bySeason.set(season, bucket);
  }
  return [...bySeason.entries()].map(([season, numbers]) => ({
    number: season,
    episodes: numbers.map((number) => ({ number })),
  }));
}

/**
 * Reverse the ani.zip table: canonical `{season, number}` → the AniDB-derived
 * entry number Simkl's anime catalog counts by (plan 0034 KTD-6). Two axes,
 * mirroring `placeInLayout`'s forward direction: the TVDB `{season, number}`
 * pair directly, then the `absolute` axis for the single-continuous-season case
 * (a tracker that keeps one season yields canonical `{1, absolute}`). `null` on
 * a miss *or* an ambiguous match — a wrong episode number is worse than no
 * write (docs/solutions/trakt-text-search-wrong-movie-match.md).
 */
function entryNumberFor(
  map: AniZipEpisodeMap,
  episode: { season: number; number: number },
): number | null {
  let match: number | null = null;
  for (const [entryNumber, row] of map) {
    const direct = row.season === episode.season && row.number === episode.number;
    const viaAbsolute = episode.season === 1 && row.absolute === episode.number;
    if (!direct && !viaAbsolute) continue;
    if (match != null && match !== entryNumber) return null;
    match = entryNumber;
  }
  return match;
}

/**
 * Resolve one anime entry's episode numbers into the AniDB domain, or a reason
 * string. Resolution is all-or-nothing per entry (the plan 0027 rule: a
 * half-mappable batch must not half-write).
 */
function animeEpisodeNumbers(entry: SimklLogEntry): number[] | string {
  if (entry.entryEpisodes != null && entry.entryEpisodes.length > 0) {
    // Already the AniDB-derived entry domain (see SimklLogEntry.entryEpisodes).
    return entry.entryEpisodes;
  }
  const canonical =
    entry.episodes != null && entry.episodes.length > 0
      ? entry.episodes
      : entry.episode != null
        ? [entry.episode]
        : [];
  if (canonical.length === 0) {
    return `logging "${entry.item.title}" to Simkl requires an episode`;
  }
  if (entry.episodeMap == null) {
    return `no ani.zip numbering table to translate "${entry.item.title}" episodes for Simkl`;
  }
  const numbers: number[] = [];
  for (const episode of canonical) {
    const entryNumber = entryNumberFor(entry.episodeMap, episode);
    if (entryNumber == null) {
      return `ani.zip has no AniDB numbering for S${episode.season}E${episode.number} of "${entry.item.title}" — skipped rather than guessed`;
    }
    numbers.push(entryNumber);
  }
  return numbers;
}

/** The `added`/`not_found` summary every Simkl sync write answers with. */
interface SimklNotFound {
  movies?: unknown[];
  shows?: unknown[];
  anime?: unknown[];
  seasons?: unknown[];
  episodes?: unknown[];
}

/**
 * Every unmatched entry the summary reports, whatever its level: the whole-item
 * buckets (movies/shows/anime) AND the sub-item ones (seasons/episodes) an
 * episode-scoped write can miss on. A `shows[]` entry whose episodes come back
 * under `not_found.episodes` is a failed log exactly like an unmatched movie —
 * it must not read as a bare ok, or the fan-out's manual-link affordance never
 * fires. Mirrors the remove adapter, whose `deleted` sum already counts
 * episodes, and the Trakt history adapter's not_found sum.
 */
function notFoundCount(notFound: SimklNotFound | null | undefined): number {
  if (notFound == null) return 0;
  return (
    (notFound.movies?.length ?? 0) +
    (notFound.shows?.length ?? 0) +
    (notFound.anime?.length ?? 0) +
    (notFound.seasons?.length ?? 0) +
    (notFound.episodes?.length ?? 0)
  );
}

/**
 * Read a sync write's outcome off its `not_found` summary. All submitted items
 * unmatched is a reasoned skip — nothing landed, and the fan-out's manual-link
 * affordance (plan 0022) fires on a reasoned skip exactly as it does on an
 * error. A *partial* miss is an `ok` carrying the reason (the plan 0031 R16
 * precedent: a success with news, never a bare success).
 */
function outcomeFromNotFound(
  submitted: number,
  notFound: SimklNotFound | null | undefined,
): ProviderWriteResult {
  const missed = notFoundCount(notFound);
  if (submitted > 0 && missed >= submitted) {
    return skip('Simkl could not match any submitted item (not_found)');
  }
  if (missed > 0) {
    return {
      status: 'ok',
      reason: `Simkl could not match ${missed} of ${submitted} submitted items`,
    };
  }
  return { status: 'ok' };
}

interface SimklSyncHistoryResponse {
  added?: { movies?: number; shows?: number; episodes?: number } | null;
  not_found?: SimklNotFound | null;
}

/**
 * The Simkl mark-watched adapter (plan 0034 R3/R4): one `POST /sync/history`
 * per invocation, whatever the batch holds — `movies[]` whole-item, `shows[]`
 * episode-level (`seasons[].episodes[]`), anime under `anime[]` in AniDB
 * numbering. KTD-3 is the shape's reason: Simkl's ~20s per-user write lock
 * turns N sequential POSTs into a `400 rate_limit` collision, so batching is
 * correctness, not politeness. That 400 (and 429) surfaces as
 * `ProviderRateLimitError` from `simklHttp` and propagates untouched — no
 * retry lives here or above (the AniList lesson,
 * docs/solutions/anilist-rate-limit-retry-storm.md).
 *
 * Entries that can't be built (no usable id, an untranslatable anime batch)
 * are dropped with their reason rather than failing the POST for the rest;
 * nothing buildable at all is a reasoned skip with no request.
 *
 * Anime series emit `seasons: [{number: 1, episodes}]`: an AniDB-convention
 * entry is one sequential run, and the docs' anime idiom — a top-level
 * `episodes[]` — is documented as auto-wrapping to exactly this season-1 form
 * (api.simkl.org add-to-history, fetched 2026-07-31).
 */
export function logToSimkl(
  deps: SimklDeps,
  entries: readonly SimklLogEntry[],
): Effect.Effect<ProviderWriteResult, ProviderError> {
  const movies: Array<Record<string, unknown>> = [];
  const shows: Array<Record<string, unknown>> = [];
  const anime: Array<Record<string, unknown>> = [];
  const dropped: string[] = [];

  for (const entry of entries) {
    const { item, watchedAt } = entry;
    const category = categoryFor(item);
    const ids = category == null ? null : idsFor(item);
    if (category == null || ids == null) {
      dropped.push(
        category == null
          ? `media type ${item.type} does not route to Simkl (routing.ts should have filtered it)`
          : `"${item.title}" has no Simkl-resolvable id (simkl/tmdb/imdb for movies & TV, simkl/mal for anime)`,
      );
      continue;
    }
    const watched = watchedAt != null ? { watched_at: watchedAt } : {};

    if (item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true)) {
      // Movie-shaped: the whole item, no seasons — but an anime film still
      // files under anime[] (see categoryFor).
      (category === 'anime' ? anime : movies).push({ ids, ...watched });
      continue;
    }
    if (item.type === 'ANIME') {
      const numbers = animeEpisodeNumbers(entry);
      if (typeof numbers === 'string') {
        dropped.push(numbers);
        continue;
      }
      anime.push({
        ids,
        seasons: [{ number: 1, episodes: numbers.map((number) => ({ number })) }],
        ...watched,
      });
      continue;
    }
    // TV: canonical episodes, grouped by season (one entry per show).
    const batch =
      entry.episodes != null && entry.episodes.length > 0
        ? entry.episodes
        : entry.episode != null
          ? [entry.episode]
          : [];
    if (batch.length === 0) {
      dropped.push(`logging "${item.title}" to Simkl requires an episode (season/number)`);
      continue;
    }
    shows.push({ ids, seasons: seasonsFor(batch), ...watched });
  }

  const submitted = movies.length + shows.length + anime.length;
  if (submitted === 0) {
    return Effect.succeed(skip(dropped[0] ?? 'nothing to log to Simkl'));
  }

  const body = {
    ...(movies.length > 0 ? { movies } : {}),
    ...(shows.length > 0 ? { shows } : {}),
    ...(anime.length > 0 ? { anime } : {}),
  };

  return Effect.gen(function* () {
    const token = yield* accessToken(deps);
    const response = yield* simklHttp<SimklSyncHistoryResponse>(deps, '/sync/history', {
      method: 'POST',
      body,
      accessToken: token,
    });
    const outcome = outcomeFromNotFound(submitted, response.not_found);
    if (outcome.status !== 'ok' || dropped.length === 0) return outcome;
    // Entries the builder had to leave out are news too (R16) — appended, so
    // a partial-not_found reason and a dropped-entry reason both survive
    // (consumers render `reason` as one line; "; " keeps them readable).
    const reason = [outcome.reason, dropped[0]]
      .filter((part): part is string => part != null)
      .join('; ');
    return { status: 'ok', reason } satisfies ProviderWriteResult;
  });
}

interface SimklAddToListResponse {
  added?: SimklNotFound | null;
  not_found?: SimklNotFound | null;
}

/**
 * The category arrays a watchlist verb sends: one item, ids only (plus the
 * per-item `to` the add sets). Shared by add and remove so the two verbs
 * cannot drift on where an item files — an anime (film included) is `anime[]`
 * both ways.
 */
function listBody(
  item: NormalizedMediaItem,
  entry: Record<string, unknown>,
): Record<string, unknown> | null {
  const category = categoryFor(item);
  if (category == null) return null;
  return { [category]: [entry] };
}

function noIdsError(item: NormalizedMediaItem, verb: string): ProviderDecodeError {
  return new ProviderDecodeError({
    provider,
    detail: `"${item.title}" has no simkl/tmdb/imdb/mal id to ${verb} against`,
  });
}

function unroutableError(item: NormalizedMediaItem): ProviderDecodeError {
  return new ProviderDecodeError({
    provider,
    detail: `media type ${item.type} does not route to Simkl (routing.ts should have filtered it)`,
  });
}

/**
 * The Simkl watchlist-add adapter (plan 0034 R5): `POST /sync/add-to-list`
 * with a per-item `to: 'plantowatch'` — the docs put `to` inside each
 * movies/shows/anime item, not at the body's top level (api.simkl.org
 * add-to-list, fetched 2026-07-31; the plan's top-level sketch predates the
 * verification). `plantowatch` is the one status Shinobu's watchlist verb maps
 * to, and the only sensible movie status anyway — movies can't be
 * `watching`/`hold` (Simkl silently rewrites those to `completed`).
 *
 * The response carries `added`/`not_found` arrays but no `existing` signal, so
 * a re-add is upsert-shaped and reports as a plain `ok` — the Trakt-style
 * "already on your watchlist" story has nothing to read here.
 */
export function addToSimklWatchlist(
  deps: SimklDeps,
  item: NormalizedMediaItem,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  const ids = idsFor(item);
  const body = ids == null ? null : listBody(item, { to: 'plantowatch', ids });
  if (body == null) {
    return Effect.fail(
      categoryFor(item) == null ? unroutableError(item) : noIdsError(item, 'watchlist'),
    );
  }

  return Effect.gen(function* () {
    const token = yield* accessToken(deps);
    const response = yield* simklHttp<SimklAddToListResponse>(deps, '/sync/add-to-list', {
      method: 'POST',
      body,
      accessToken: token,
    });
    return outcomeFromNotFound(1, response.not_found);
  });
}

interface SimklHistoryRemoveResponse {
  deleted?: { movies?: number; shows?: number; episodes?: number } | null;
  not_found?: SimklNotFound | null;
}

/**
 * Whether `entry` is the library row for `item`. Simkl-id equality first (the
 * only id both sides are guaranteed to agree on), then the bridge ids —
 * gated on film-vs-series shape, because TMDB numbers movies and series
 * independently and `movies[]`/`shows[]`/`anime[]` are searched together here
 * (an anime series Simkl files under `anime[]` can arrive typed `TV`).
 */
function isFilmLike(candidate: NormalizedMediaItem): boolean {
  return (
    candidate.type === 'MOVIE' || (candidate.type === 'ANIME' && candidate.isFilm === true)
  );
}

function isSameSimklItem(item: NormalizedMediaItem, entry: SimklLibraryEntry): boolean {
  const mine = item.externalIds;
  const theirs = entry.item.externalIds;
  if (mine.simkl != null && theirs.simkl != null) return mine.simkl === theirs.simkl;
  if (isFilmLike(item) !== isFilmLike(entry.item)) return false;
  return (
    (mine.mal != null && mine.mal === theirs.mal) ||
    (mine.anilist != null && mine.anilist === theirs.anilist) ||
    (mine.tmdb != null && mine.tmdb === theirs.tmdb) ||
    (mine.imdb != null && mine.imdb !== '' && mine.imdb === theirs.imdb)
  );
}

/** The `plantowatch` row for `item`, across all three buckets. */
function findPlanToWatchEntry(
  library: SimklLibrary,
  item: NormalizedMediaItem,
): SimklLibraryEntry | null {
  return (
    [...library.shows, ...library.movies, ...library.anime].find((entry) =>
      isSameSimklItem(item, entry),
    ) ?? null
  );
}

/**
 * What `/sync/history/remove` would destroy alongside the list entry. The
 * per-episode array and the server's own counter disagree on catch-up-logged
 * shows (the array is only populated with `episode_watched_at=yes`), so the
 * guard takes whichever is larger — under-counting here is what silently
 * deletes history.
 */
function watchHistorySize(entry: SimklLibraryEntry): number {
  return Math.max(entry.item.currentProgress, entry.watchedEpisodes.length);
}

/** The message behind a refused destructive removal — the picker's warning, restated. */
function destructiveSkipReason(item: NormalizedMediaItem): string {
  return `removing “${item.title}” on Simkl would delete its watch history too — confirm the warning to remove it anyway`;
}

/**
 * The Simkl watchlist-**remove** adapter (plan 0034 R5, Open Question 1 —
 * resolved against the live docs, 2026-07-31; flipped live by plan 0036).
 * There is **no** `/sync/remove-from-list` sibling and no status-only removal:
 * api.simkl.org documents `POST /sync/history/remove` as the canonical
 * un-track path, and a *whole-item* body (ids, no `seasons`/`episodes`)
 * removes the item from the user's library **entirely** — the plan-to-watch
 * entry, any watch history, and the rating. (A legacy `to: "remove"` on
 * add-to-list exists but is undocumented and deprecated.)
 *
 * That is why this is the one removal adapter with a **fresh in-effect read**
 * before the write — plan 0031 R36's invariant, which until now only AniList
 * needed:
 *
 * - It is what makes the destructive case *knowable*. Simkl holds one status
 *   per item, so a `plantowatch` row normally has no history at all; the
 *   dangerous row is the one a user manually moved back to plan-to-watch after
 *   watching part of it, and only a live read can tell the two apart.
 * - Absent from the fresh `plantowatch` snapshot means the item is not on the
 *   watchlist any more (a log moved it to `watching`/`completed`, or another
 *   device removed it). That is a reasoned skip with **no POST**, which is
 *   also what keeps a derived post-log removal out of Simkl's ~20s per-user
 *   write lock (docs/solutions/simkl-rate-limits-and-write-lock.md).
 *
 * With membership proven, `deleted: 0` is **not** a skip: a plan-to-watch row
 * with no history has no history rows to delete, and reporting that as "wasn't
 * in your library" would call every clean removal a no-op. `not_found` stays
 * the failure signal.
 */
export function removeFromSimklWatchlist(
  deps: SimklDeps,
  item: NormalizedMediaItem,
  options: { allowDestructive?: boolean } = {},
): Effect.Effect<ProviderWriteResult, ProviderError> {
  const ids = idsFor(item);
  const body = ids == null ? null : listBody(item, { ids });
  if (body == null) {
    return Effect.fail(
      categoryFor(item) == null ? unroutableError(item) : noIdsError(item, 'unwatchlist'),
    );
  }

  return Effect.gen(function* () {
    const token = yield* accessToken(deps);
    const library = yield* getAllItems(deps, { status: 'plantowatch' });
    const entry = findPlanToWatchEntry(library, item);
    if (entry == null) return skip('was not on your Simkl watchlist');
    if (watchHistorySize(entry) > 0 && options.allowDestructive !== true) {
      return skip(destructiveSkipReason(item));
    }

    const response = yield* simklHttp<SimklHistoryRemoveResponse>(
      deps,
      '/sync/history/remove',
      { method: 'POST', body, accessToken: token },
    );
    if (notFoundCount(response.not_found) > 0) {
      return skip('Simkl could not match any submitted item (not_found)');
    }
    return { status: 'ok' } satisfies ProviderWriteResult;
  });
}
