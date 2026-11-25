import * as Effect from 'effect/Effect';

import type { ProviderWriteResult } from '@/features/log-media/fan-out';
import type { AniZipEpisodeMap } from '@/lib/providers/mapping/anizip';
import { entryNumberFor } from '@/lib/providers/mapping/episode-translation';
import { ProviderAuthError, ProviderDecodeError, type ProviderError } from '@/lib/providers/errors';
import { trackingStatusSkip } from '@/lib/providers/tracking-status';
import { Provider, type TrackingStatus } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';
import type { SimklDeps } from './deps';
import { simklHttp } from './http';
import type { SimklLibrary, SimklLibraryEntry, SimklWatchStatus } from './normalize';
import { getAllItems } from './reads';

const provider = Provider.Simkl;

/** One item in a Simkl history batch, with an optional anime numbering table. */
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
 * Fold entries for the **same item** (same ids, same `watched_at`) into one
 * `seasons[].episodes[]` list. The write-lock queue (plan 0037,
 * `features/log-media/simkl-write-lock.ts`) hands this adapter one entry per
 * coalesced log — five confirms of one show arrive as five entries — and
 * Simkl should see one show with five episodes, not the same show five times.
 * Different `watched_at`s stay apart: Simkl dates a whole item, not an episode.
 */
function mergeSameItem(
  entries: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const merged = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    const key = JSON.stringify({ ids: entry.ids, watched_at: entry.watched_at });
    const existing = merged.get(key);
    if (existing == null || !Array.isArray(existing.seasons) || !Array.isArray(entry.seasons)) {
      merged.set(existing == null ? key : `${key}#${merged.size}`, entry);
      continue;
    }
    const seasons = existing.seasons as Array<{ number: number; episodes: Array<{ number: number }> }>;
    for (const season of entry.seasons as typeof seasons) {
      const target = seasons.find((candidate) => candidate.number === season.number);
      if (target == null) seasons.push(season);
      else target.episodes.push(...season.episodes);
    }
  }
  return [...merged.values()];
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
 * Count unmatched sub-items as well as whole items. An episode miss must produce a manual
 * link.
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
 * One entry's sync-body payload and the array it files under, or the reason
 * `logToSimkl` drops it.
 */
function buildEntry(
  entry: SimklLogEntry,
): { category: SimklCategory; payload: Record<string, unknown> } | string {
  const { item, watchedAt } = entry;
  const category = categoryFor(item);
  const ids = category == null ? null : idsFor(item);
  if (category == null || ids == null) {
    return category == null
      ? `media type ${item.type} does not route to Simkl (routing.ts should have filtered it)`
      : `"${item.title}" has no Simkl-resolvable id (simkl/tmdb/imdb for movies & TV, simkl/mal for anime)`;
  }
  const watched = watchedAt != null ? { watched_at: watchedAt } : {};

  if (item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true)) {
    // Movie-shaped: the whole item, no seasons — but an anime film still
    // files under anime[] (see categoryFor).
    return { category, payload: { ids, ...watched } };
  }
  if (item.type === 'ANIME') {
    const numbers = animeEpisodeNumbers(entry);
    if (typeof numbers === 'string') return numbers;
    return {
      category,
      payload: {
        ids,
        seasons: [{ number: 1, episodes: numbers.map((number) => ({ number })) }],
        ...watched,
      },
    };
  }
  // TV: canonical episodes, grouped by season (one entry per show).
  const batch =
    entry.episodes != null && entry.episodes.length > 0
      ? entry.episodes
      : entry.episode != null
        ? [entry.episode]
        : [];
  if (batch.length === 0) {
    return `logging "${item.title}" to Simkl requires an episode (season/number)`;
  }
  return { category, payload: { ids, seasons: seasonsFor(batch), ...watched } };
}

/**
 * Why `logToSimkl` would drop this entry, or null when it can be written.
 * Depends only on the entry, so the log queue asks before coalescing: an
 * unbuildable entry must report its own skip, not ride a batch's `ok`.
 */
export function simklEntryDropReason(entry: SimklLogEntry): string | null {
  const built = buildEntry(entry);
  return typeof built === 'string' ? built : null;
}

/**
 * Batch all history entries in one POST to respect Simkl's per-user write lock. Anime uses
 * AniDB numbering. Unbuildable entries report a reason.
 */
export function logToSimkl(
  deps: SimklDeps,
  entries: readonly SimklLogEntry[],
): Effect.Effect<ProviderWriteResult, ProviderError> {
  const movies: Array<Record<string, unknown>> = [];
  const shows: Array<Record<string, unknown>> = [];
  const anime: Array<Record<string, unknown>> = [];
  const dropped: string[] = [];
  const byCategory: Record<SimklCategory, Array<Record<string, unknown>>> = { movies, shows, anime };

  for (const entry of entries) {
    const built = buildEntry(entry);
    if (typeof built === 'string') {
      dropped.push(built);
      continue;
    }
    byCategory[built.category].push(built.payload);
  }

  const mergedShows = mergeSameItem(shows);
  const mergedAnime = mergeSameItem(anime);
  const submitted = movies.length + mergedShows.length + mergedAnime.length;
  if (submitted === 0) {
    return Effect.succeed(skip(dropped[0] ?? 'nothing to log to Simkl'));
  }

  const body = {
    ...(movies.length > 0 ? { movies } : {}),
    ...(mergedShows.length > 0 ? { shows: mergedShows } : {}),
    ...(mergedAnime.length > 0 ? { anime: mergedAnime } : {}),
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

/** Put the target status on each item. Simkl does not report whether an add already existed. */
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

const SIMKL_TRACKING_STATUS = { paused: 'hold', dropped: 'dropped' } as const;

const SIMKL_STATUS_NAMES: Record<SimklWatchStatus, string> = {
  watching: 'watching',
  plantowatch: 'plan to watch',
  hold: 'on hold',
  completed: 'completed',
  dropped: 'dropped',
};

/**
 * Pause (`hold`) or drop, on the library row `entry` a fresh read found. The
 * caller does the read because the row matcher lives with the library query
 * (`findLibraryEntry`). It sends the row's own ids, so an anime cour changes
 * only that cour. Only a status moves: watched episodes stay. A history add
 * re-files the item by itself, so the next log resumes it with no request
 * from here (api.simkl.org add-to-history).
 */
export function setSimklTrackingStatus(
  deps: SimklDeps,
  entry: SimklLibraryEntry | null,
  status: TrackingStatus,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  const target = SIMKL_TRACKING_STATUS[status];
  const reason = trackingStatusSkip(
    provider,
    entry?.status ?? null,
    target,
    ['watching', 'hold', 'dropped'],
    (name) => SIMKL_STATUS_NAMES[name],
  );
  if (reason != null || entry == null) return Effect.succeed(skip(reason ?? ''));
  const ids = idsFor(entry.item);
  const body = ids == null ? null : listBody(entry.item, { to: target, ids });
  if (body == null) return Effect.fail(noIdsError(entry.item, status === 'paused' ? 'pause' : 'drop'));

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
 * A whole-item removal clears watchlist membership, history, and rating. Check current
 * plan-to-watch membership and require separate confirmation for history. A confirmed bare
 * entry can succeed with zero deleted plays.
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
