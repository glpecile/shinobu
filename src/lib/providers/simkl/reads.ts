import { Clock, Effect } from 'effect';

import type { NormalizedMediaItem } from '@/types/media';
import { ProviderDecodeError, type ProviderError } from '@/lib/providers/errors';
import { SIMKL_CDN_BASE_URL } from './config';
import type { SimklDeps } from './deps';
import { simklHttp } from './http';
import {
  normalizeActivities,
  normalizeAllItems,
  normalizeCalendarFile,
  normalizeSearchIdMatch,
  normalizeTrendingItem,
  normalizeUserSettings,
  type SimklActivities,
  type SimklActivitiesRaw,
  type SimklAllItemsResponse,
  type SimklCalendarEntry,
  type SimklCalendarFile,
  type SimklLibrary,
  type SimklLibraryBucket,
  type SimklSearchIdMatch,
  type SimklTrendingItem,
  type SimklTrendingKind,
  type SimklUserSettings,
  type SimklUserSettingsRaw,
  type SimklWatchStatus,
} from './normalize';

const provider = 'simkl' as const;

/**
 * The token rides from the store per call, Trakt-style — but with no refresh
 * machinery behind it: a Simkl 401 is a dead session (plan 0034 KTD-2), and
 * `simklHttp` already maps it terminally.
 */
function accessToken(deps: SimklDeps): string | undefined {
  return deps.tokens.get()?.accessToken;
}

// ---- Library snapshot (plan 0034 KTD-5 pairs this with getLastActivities) ----

/**
 * Docs (api.simkl.org get-all-items, verified 2026-07-31): `/sync/all-items`
 * returns the entire filtered library in one response — **no pagination
 * headers exist**. This guard is the assert half of assert-and-degrade: if
 * Simkl ever starts paginating, reading page 1 as "the whole library" would
 * silently corrupt every downstream merge, so the read fails loudly instead.
 */
const PAGINATION_HEADERS = [
  'x-pagination-page',
  'x-pagination-limit',
  'x-pagination-page-count',
  'x-pagination-item-count',
];

function fullSnapshotGuard(headers: Headers): ProviderError | undefined {
  const found = PAGINATION_HEADERS.find((header) => headers.has(header));
  if (found == null) return undefined;
  return new ProviderDecodeError({
    provider,
    detail: `/sync/all-items answered with ${found} — the un-paginated full-snapshot assumption (plan 0034 U3) no longer holds; add paging before trusting this read`,
  });
}

export interface SimklAllItemsParams {
  type?: SimklLibraryBucket;
  status?: SimklWatchStatus;
}

/**
 * The user's whole Simkl library as one snapshot: per-item `status`, watched
 * counts, per-episode watched instants (`episode_watched_at=yes`), and the
 * next-to-watch pointer *with its air instant* (`next_watch_info=yes` — the
 * bare `next_to_watch` field is only an "S##E##" string). Do not poll this on
 * a timer: `getLastActivities` is the cheap delta signal (KTD-5); the query
 * layer refetches this only when it moves.
 */
export function getAllItems(
  deps: SimklDeps,
  params: SimklAllItemsParams = {},
): Effect.Effect<SimklLibrary, ProviderError> {
  // Simkl's path grammar puts status *after* type — a status-only filter
  // rides the `all` type segment the API defines for exactly this.
  const segments =
    params.type != null
      ? `/${params.type}${params.status != null ? `/${params.status}` : ''}`
      : params.status != null
        ? `/all/${params.status}`
        : '';
  return Effect.gen(function* () {
    const raw = yield* simklHttp<SimklAllItemsResponse>(
      deps,
      `/sync/all-items${segments}?extended=full&episode_watched_at=yes&next_watch_info=yes`,
      { accessToken: accessToken(deps), inspectResponse: fullSnapshotGuard },
    );
    const now = yield* Clock.currentTimeMillis;
    // An empty library is `{}` — normalize tolerates the missing buckets.
    return normalizeAllItems(raw ?? {}, new Date(now).toISOString());
  });
}

/**
 * `/sync/activities` — the cache-invalidation signal (KTD-5). Poll this
 * cheaply; refetch `getAllItems` only when a bucket's timestamp moved.
 */
export function getLastActivities(
  deps: SimklDeps,
): Effect.Effect<SimklActivities, ProviderError> {
  return simklHttp<SimklActivitiesRaw>(deps, '/sync/activities', {
    accessToken: accessToken(deps),
  }).pipe(Effect.map(normalizeActivities));
}

// ---- Calendar (CDN JSON, KTD-4) ----

export type SimklCalendarKind = 'tv' | 'anime' | 'movie_release';

/**
 * The rolling ~34-day calendar file (yesterday + next 33 days) from the
 * public CDN — standard params only, **no Authorization** (it would be sent
 * to a third-party CDN host for nothing) and never a cache-busting param
 * (KTD-4: the file carries 5-hour cache headers; a varying param defeats
 * them). The file is ~1.5 MB — this effect just fetches; holding the parsed
 * result for a staleTime window is the query layer's job (U7/U8).
 */
export function getCalendar(
  deps: SimklDeps,
  kind: SimklCalendarKind,
): Effect.Effect<SimklCalendarEntry[], ProviderError> {
  return simklHttp<SimklCalendarFile>(deps, `/calendar/v2/${kind}.json`, {
    baseUrl: SIMKL_CDN_BASE_URL,
  }).pipe(Effect.map(normalizeCalendarFile));
}

/**
 * The monthly archive file — the fallback that dates a tracked show whose
 * next episode aired *before* the rolling window (catch-up viewing, the
 * common Up Next case — plan 0034 U3). Same CDN contract as `getCalendar`.
 */
export function getMonthlyCalendar(
  deps: SimklDeps,
  kind: SimklCalendarKind,
  year: number,
  month: number,
): Effect.Effect<SimklCalendarEntry[], ProviderError> {
  const paddedMonth = String(month).padStart(2, '0');
  return simklHttp<SimklCalendarFile>(
    deps,
    `/calendar/v2/${year}/${paddedMonth}/${kind}.json`,
    { baseUrl: SIMKL_CDN_BASE_URL },
  ).pipe(Effect.map(normalizeCalendarFile));
}

// ---- Trending (CDN JSON, KTD-8) ----

export interface SimklTrendingParams {
  /** `today` refreshes hourly, `week`/`month` daily. Defaults to `week`. */
  interval?: 'today' | 'week' | 'month';
}

/**
 * Simkl's Most Watched list for one kind — a public CDN file (verified
 * against api.simkl.org/api-reference/trending and live-probed 2026-07-31;
 * the API host has no trending endpoint), client params only, no user token.
 * This is what replaces Trakt's trending rows so the feed is never empty with
 * zero providers connected (R11).
 */
export function getTrending(
  deps: SimklDeps,
  kind: SimklTrendingKind,
  params: SimklTrendingParams = {},
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const interval = params.interval ?? 'week';
  return Effect.gen(function* () {
    const raw = yield* simklHttp<SimklTrendingItem[]>(
      deps,
      `/discover/trending/${kind}/${interval}_100.json`,
      { baseUrl: SIMKL_CDN_BASE_URL },
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return raw
      .map((item) => normalizeTrendingItem(item, kind, nowIso))
      .filter((item): item is NormalizedMediaItem => item != null);
  });
}

// ---- Profile ----

/**
 * The connected account's profile — the "connected as who" read (R6).
 * POST-shaped despite being a read: the docs say "historical reasons"
 * (api.simkl.org get-user-settings, verified 2026-07-31), so the queryFn
 * wiring in U5 must not assume GET.
 */
export function getUserSettings(
  deps: SimklDeps,
): Effect.Effect<SimklUserSettings, ProviderError> {
  return simklHttp<SimklUserSettingsRaw>(deps, '/users/settings', {
    method: 'POST',
    accessToken: accessToken(deps),
  }).pipe(Effect.map(normalizeUserSettings));
}

// ---- Id resolution (KTD-6) ----

export interface SimklLookupParams {
  tmdb?: number;
  imdb?: string;
  tvdb?: number;
  mal?: number;
  anilist?: number;
  anidb?: number;
  /** Required by Simkl when looking up by `tmdb` (movie/show ids collide). */
  type?: 'movie' | 'show';
}

/**
 * `/search/id` — how a foreign id (TMDB/IMDB/MAL/AniList/TVDB/AniDB) acquires
 * its Simkl identity before a write routes (plan 0034 KTD-6). Public read,
 * client params only. An unknown id is a `200 []`, so an empty array — never
 * an error — means "Simkl doesn't index this".
 */
export function lookupByExternalId(
  deps: SimklDeps,
  params: SimklLookupParams,
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const query = new URLSearchParams();
  for (const key of ['tmdb', 'imdb', 'tvdb', 'mal', 'anilist', 'anidb', 'type'] as const) {
    const value = params[key];
    if (value != null) query.set(key, String(value));
  }
  return Effect.gen(function* () {
    const raw = yield* simklHttp<SimklSearchIdMatch[]>(
      deps,
      `/search/id?${query.toString()}`,
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return raw
      .map((match) => normalizeSearchIdMatch(match, nowIso))
      .filter((item): item is NormalizedMediaItem => item != null);
  });
}
