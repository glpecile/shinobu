import { useQuery, type QueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import {
  fetchAniZipEpisodeMap,
  fetchAniZipIds,
  type AniZipEpisodeMap,
  type AniZipLookup,
} from '@/lib/providers/mapping/anizip';
import { searchAnimeFilms } from '@/lib/providers/anilist/reads';
import {
  pickAnimeFilmMatch,
  pickMovieMatch,
} from '@/lib/providers/pick-movie-match';
import type { SeasonLayout } from '@/lib/providers/mapping/season-layout';
import { lookupByExternalId as lookupSimklByExternalId } from '@/lib/providers/simkl/reads';
import {
  findByTvdbId,
  getTvSeasonLayout,
  searchMovie,
} from '@/lib/providers/tmdb/reads';
import {
  getShowSeasonLayout,
  lookupByExternalId,
  searchMedia,
} from '@/lib/providers/trakt/reads';
import { getClientIdForProvider } from '@/state/session/provider-config';
import { tmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedMediaItem } from '@/types/media';

import { anilistDeps } from './anilist';
import { simklDeps } from './simkl';
import { tmdbDeps } from './tmdb';
import { traktDeps } from './trakt';

/**
 * Whether Trakt has a usable client id right now — BYO credentials (already
 * true today) or, pre-detachment, the bundled env id. The gate every
 * Trakt-riding lookup below checks before spending a request on it (plan 0034
 * KTD-8): once U9 removes the bundled credentials, this is `false` for every
 * non-BYO user, and these lookups fall back to Simkl/TMDB instead of quietly
 * degrading to `null` forever.
 */
function traktHasCredentials(): boolean {
  return getClientIdForProvider('trakt') !== '';
}

/**
 * Cross-provider identity lookups (plan 0011 decisions 5–6): ani.zip bridges
 * AniList ↔ TVDB/TMDB/IMDB, and Trakt `/search` turns foreign ids or a
 * title+year into a full catalogue record. Every lookup is cached forever
 * (mappings don't churn) and degrades to `null` on a miss. Shared by the log
 * fan-out (features/log-media/enrich.ts) and the details screen's metadata
 * enrichment — both hit the same cache entries.
 */

export const mappingQueryKeys = {
  anizip: (lookup: AniZipLookup) => ['mapping', 'anizip', lookup] as const,
  /** AniList entry → canonical season/episode numbering (plan 0027 KTD4). */
  anizipEpisodes: (anilistId: number) =>
    ['mapping', 'anizip-episodes', anilistId] as const,
  /** A show's own season/episode-count skeleton (plan 0027 season placement). */
  seasonLayout: (tmdbId: number | null, traktId: number | null) =>
    ['mapping', 'season-layout', tmdbId, traktId] as const,
  traktLookup: (source: string, id: number | string, kind: string) =>
    ['mapping', 'trakt-lookup', source, id, kind] as const,
  traktSearch: (title: string, year: number | undefined) =>
    ['mapping', 'trakt-search', title, year ?? 'any'] as const,
  /** TVDB → TMDB tv-id bridge (`/find`), the anime-TV leg of plan 0014. */
  tmdbFind: (tvdbId: number) => ['mapping', 'tmdb-find', tvdbId] as const,
  /** Title+year → TMDB movie id, for id-less films (Letterboxd). */
  tmdbMovieSearch: (title: string, year: number | undefined) =>
    ['mapping', 'tmdb-movie-search', title, year ?? 'any'] as const,
  /** Title+year → AniList id, the anime-film fallback when ani.zip misses. */
  anilistFilmSearch: (title: string, year: number | undefined) =>
    ['mapping', 'anilist-film-search', title, year ?? 'any'] as const,
};

const FOREVER = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
};

export function cachedAniZipIds(queryClient: QueryClient, lookup: AniZipLookup) {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.anizip(lookup),
    queryFn: () => fetchAniZipIds(httpFetch, lookup),
    ...FOREVER,
  });
}

/**
 * Not `FOREVER`, unlike every other mapping here: the episode table is the one
 * ani.zip read whose *content* changes — a just-aired episode lands in the
 * dataset hours after it airs, and a forever-cached miss would keep skipping
 * Trakt/Serializd for the rest of the session (plan 0027 KTD4). One flat window
 * for hits and misses alike — deliberately not a content-dependent
 * hit-long/miss-short scheme, which no query in this app has — is what
 * self-heals that lag on the next log action.
 */
const EPISODE_MAP_STALE_MS = 60 * 60_000;

function episodeMapQuery(anilistId: number) {
  return {
    queryKey: mappingQueryKeys.anizipEpisodes(anilistId),
    queryFn: (): Promise<AniZipEpisodeMap | null> =>
      fetchAniZipEpisodeMap(httpFetch, { anilistId }),
    staleTime: EPISODE_MAP_STALE_MS,
    // Match gcTime to the window: the default 5 min would evict the decode of a
    // ~1 MB document long before it goes stale, re-downloading it per log.
    gcTime: EPISODE_MAP_STALE_MS,
  };
}

/**
 * The AniList-entry → canonical season/episode table behind the log fan-out's
 * translation step (plan 0027 U2). **Write actions only** (R7): the underlying
 * document is ~1 MB (docs/solutions/web-cors-anizip.md), so no feed or list
 * render path may call this. The one sanctioned render-path consumer is the
 * anime details accordion's header query (`useAniZipEpisodeMapQuery`), which
 * doubles as the pre-warm for a log started from that screen.
 */
export function cachedAniZipEpisodeMap(
  queryClient: QueryClient,
  anilistId: number,
): Promise<AniZipEpisodeMap | null> {
  return queryClient.fetchQuery(episodeMapQuery(anilistId));
}

/**
 * R8's display half: the anime seasons accordion header shows the entry's true
 * canonical season ("Season 2") instead of the synthesized "Season 1". Shares
 * its cache entry with `cachedAniZipEpisodeMap`, so mounting it on the details
 * screen also warms the log path. Never mount this on a list/feed row.
 */
export function useAniZipEpisodeMapQuery(anilistId: number | undefined) {
  return useQuery({
    ...episodeMapQuery(anilistId ?? -1),
    enabled: anilistId != null,
  });
}

/**
 * How the trackers themselves carve this show into seasons — the arbiter the
 * anime log fan-out places an ani.zip row against (plan 0027;
 * `lib/providers/mapping/season-layout.ts` explains why TVDB's seasons aren't
 * enough). TMDB first: no user session needed, and Serializd's season ids
 * *are* TMDB's seasons. Trakt is the fallback for a build with no TMDB token —
 * a public catalogue call, so it works before Trakt is even connected. Live
 * probes found the two agreeing on every sampled show, so whichever answers
 * serves both write targets.
 *
 * Cached like the episode map rather than forever: a currently-airing season
 * gains episodes, and a show TMDB hasn't split yet may get split later.
 * `null` when neither source can answer → the log skips with a reason.
 */
export function cachedSeasonLayout(
  queryClient: QueryClient,
  ids: { tmdb?: number; trakt?: number },
): Promise<SeasonLayout | null> {
  const tmdbId = ids.tmdb;
  const traktId = ids.trakt;
  if (tmdbId == null && traktId == null) return Promise.resolve(null);
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.seasonLayout(tmdbId ?? null, traktId ?? null),
    queryFn: async (): Promise<SeasonLayout | null> => {
      if (tmdbId != null) {
        const layout = await Effect.runPromise(
          getTvSeasonLayout(tmdbDeps(), { tmdbId }),
        ).catch(() => null);
        // An empty array means TMDB answered but knows no seasons — fall
        // through to Trakt rather than treating "no data" as an answer.
        if (layout != null && layout.length > 0) return layout;
      }
      // Trakt's season structure is public catalogue data, but the client id
      // that authorizes it (plan 0034 KTD-8) is exactly the credential
      // detachment removes for a non-BYO build — gated rather than left to
      // fail into the same `.catch(() => null)` an empty client id would give
      // it anyway, so a Trakt-less build doesn't spend a doomed round trip.
      // No Simkl equivalent exists (`/sync/all-items` only reports a user's
      // own watched seasons, not a show's canonical structure) — TMDB above
      // stays the substitute KTD-8 allows for.
      if (traktId != null && traktHasCredentials()) {
        const layout = await Effect.runPromise(
          getShowSeasonLayout(traktDeps(), { traktId }),
        ).catch(() => null);
        if (layout != null && layout.length > 0) return layout;
      }
      return null;
    },
    staleTime: EPISODE_MAP_STALE_MS,
    gcTime: EPISODE_MAP_STALE_MS,
  });
}

/**
 * A foreign id (TVDB/TMDB/IMDB) → a full catalogue record, Trakt-shaped when
 * Trakt has credentials, else Simkl's `/search/id` (plan 0034 KTD-8). Shared
 * by `cachedTraktLookup` (below) and `useTraktIdentityQuery` — one gate, not
 * two copies that could disagree about when Trakt is usable.
 *
 * `enrich.ts`'s anime→Trakt-id bridge only ever calls `cachedTraktLookup`
 * while `connected.includes('trakt')` is true, which (session model) only
 * holds when credentials exist, so that call site keeps getting a genuine
 * Trakt id; `useTraktIdentityQuery` is unconditional and is exactly what this
 * gate protects — without it, a non-BYO build post-detachment would silently
 * resolve to `null` forever instead of Simkl's still-useful
 * tmdb/imdb/mal/simkl id bag.
 */
function traktOrSimklLookup(params: {
  source: 'tvdb' | 'tmdb' | 'imdb';
  id: number | string;
  kind: 'movie' | 'show';
}): Promise<NormalizedMediaItem | null> {
  if (traktHasCredentials()) {
    return Effect.runPromise(lookupByExternalId(traktDeps(), params)).catch(() => null);
  }
  return Effect.runPromise(
    lookupSimklByExternalId(simklDeps(), {
      type: params.kind,
      ...(params.source === 'tvdb' ? { tvdb: Number(params.id) } : {}),
      ...(params.source === 'tmdb' ? { tmdb: Number(params.id) } : {}),
      ...(params.source === 'imdb' ? { imdb: String(params.id) } : {}),
    }),
  )
    .then((results) => results[0] ?? null)
    .catch(() => null);
}

export function cachedTraktLookup(
  queryClient: QueryClient,
  params: {
    source: 'tvdb' | 'tmdb' | 'imdb';
    id: number | string;
    kind: 'movie' | 'show';
  },
) {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.traktLookup(params.source, params.id, params.kind),
    queryFn: () => traktOrSimklLookup(params),
    ...FOREVER,
  });
}

/**
 * Resolve a movie's full catalogue record (metadata + cross-ids) from its
 * title+year — the bridge for items whose origin provider carries no cross-id
 * at all (a Letterboxd watchlist film is just a slug + title + year). Trakt
 * text search when Trakt has credentials (unchanged); TMDB `/search/movie`
 * otherwise (plan 0034 KTD-8 — Simkl's reads surface has no title search, so
 * TMDB is the actual substitute here, not a fallback of convenience). Which
 * result counts as *the* film is always `pickMovieMatch`'s year-gated call —
 * never the raw top hit
 * (docs/solutions/trakt-text-search-wrong-movie-match.md). A miss, or no
 * usable source at all, resolves to `null`.
 */
function movieSearchQuery(title: string, year: number | undefined) {
  return {
    queryKey: mappingQueryKeys.traktSearch(title, year),
    queryFn: (): Promise<NormalizedMediaItem | null> => {
      if (traktHasCredentials()) {
        // limit 10, not 5: an upcoming film can rank below a popular classic
        // sharing its title, and the year gate needs it in the result set.
        return Effect.runPromise(searchMedia(traktDeps(), { query: title, limit: 10 }))
          .then((results) => pickMovieMatch(results, year, title))
          .catch(() => null);
      }
      if (tmdbToken() === '') return Promise.resolve(null);
      return Effect.runPromise(searchMovie(tmdbDeps(), { query: title, year }))
        .then((results) => pickMovieMatch(results, year, title))
        .catch(() => null);
    },
    ...FOREVER,
  };
}

/**
 * TVDB id → TMDB tv id via TMDB `/find` — how a TV anime (ani.zip maps those
 * to TVDB, not TMDB) acquires the id the TMDB-first detail read needs.
 * Forever-cached like every mapping; null on a miss or without a TMDB token.
 */
export function cachedTmdbTvIdByTvdb(
  queryClient: QueryClient,
  tvdbId: number,
): Promise<number | null> {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.tmdbFind(tvdbId),
    queryFn: (): Promise<number | null> =>
      Effect.runPromise(findByTvdbId(tmdbDeps(), { tvdbId })).catch(() => null),
    ...FOREVER,
  });
}

export function cachedTraktTextSearch(
  queryClient: QueryClient,
  title: string,
  year: number | undefined,
) {
  return queryClient.fetchQuery(movieSearchQuery(title, year));
}

/**
 * Title+year → TMDB movie id via TMDB `/search/movie` — the tracker-free way a
 * Letterboxd-only film (slug + title + year, no Trakt to text-search) acquires
 * the id the TMDB-first detail read needs. `pickMovieMatch`'s year gate rejects
 * a same-title different-year film rather than serving wrong metadata. Forever-
 * cached like every mapping; null on a miss (or without a TMDB token).
 */
export function cachedTmdbMovieIdByTitle(
  queryClient: QueryClient,
  params: { title: string; year: number | undefined },
): Promise<number | null> {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.tmdbMovieSearch(params.title, params.year),
    queryFn: (): Promise<number | null> =>
      searchTmdbMovieId(params).catch(() => null),
    ...FOREVER,
  });
}

/**
 * `primary_release_year` is a recall fix — TMDB ranks by popularity, so a
 * brand-new film sharing its title with a classic falls off page 1 and the
 * year gate never sees it (Labyrinth 2025, Motor City 2025). But it filters
 * *exactly*, which would also delete `pickMovieMatch`'s ±1 festival-vs-wide-
 * release tolerance — so a miss retries unfiltered and re-runs the same gate.
 * The second request only ever fires on a miss.
 */
async function searchTmdbMovieId(params: {
  title: string;
  year: number | undefined;
}): Promise<number | null> {
  const gated = await Effect.runPromise(
    searchMovie(tmdbDeps(), { query: params.title, year: params.year }),
  ).then((results) => pickMovieMatch(results, params.year, params.title));
  if (gated != null || params.year == null) {
    return gated?.externalIds.tmdb ?? null;
  }
  return Effect.runPromise(
    searchMovie(tmdbDeps(), { query: params.title }),
  ).then(
    (results) =>
      pickMovieMatch(results, params.year, params.title)?.externalIds.tmdb ??
      null,
  );
}

/**
 * Title+year → AniList id for an anime *film* (plan 0024 KTD3). ani.zip's
 * `themoviedb_id` index is TV-oriented, so a TMDB/Trakt-first anime film
 * (ChaO, 2025) reverse-maps to nothing and the log fan-out silently drops
 * AniList. This is the miss-path fallback, never the first attempt: ani.zip
 * runs first and this only fires when it comes back empty.
 *
 * Forever-cached **including the miss** — a `null` here means "AniList has no
 * film under that title+year", which won't change, and re-asking would spend
 * the 30 req/min budget (docs/solutions/anilist-rate-limit-retry-storm.md) on
 * every ordinary movie the user logs.
 */
export function cachedAniListFilmId(
  queryClient: QueryClient,
  params: { title: string; year: number | undefined },
): Promise<number | null> {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.anilistFilmSearch(params.title, params.year),
    queryFn: (): Promise<number | null> =>
      Effect.runPromise(
        searchAnimeFilms(anilistDeps(), { query: params.title }),
      )
        .then(
          (results) =>
            pickAnimeFilmMatch(results, params.year, params.title)?.externalIds
              .anilist ?? null,
        )
        .catch(() => null),
    ...FOREVER,
  });
}

/**
 * Catalogue record backing a movie that arrived without one — today that's
 * Letterboxd items, whose origin carries no overview/runtime/genres/rating
 * and no cross-provider ids. Disabled once the item already has a Trakt id
 * (it *is* a catalogue record then), or a TMDB id — those take the exact
 * `useTraktIdentityQuery` id lookup instead of this fuzzy title+year text
 * search (wrong-match risk: docs/solutions/trakt-text-search-wrong-movie-match.md).
 * Merge the result with `mergeCatalogueMetadata` (lib/providers/merge-metadata.ts).
 */
export function useMovieCatalogueQuery(item: NormalizedMediaItem | undefined) {
  const title = item?.title ?? '';
  return useQuery({
    ...movieSearchQuery(title, item?.year),
    enabled:
      item != null &&
      item.type === 'MOVIE' &&
      item.externalIds.trakt == null &&
      item.externalIds.tmdb == null &&
      title !== '',
  });
}

/**
 * Catalogue record for an item that knows its TMDB id but not its Trakt one —
 * today that's a filmography credit opened from the person screen
 * (TMDB-normalized, so MOVIE/TV only). Trakt-shaped when Trakt has
 * credentials, else Simkl's (plan 0034 KTD-8 — this call is unconditional,
 * unlike `enrich.ts`'s gated one, so it's exactly the caller a non-BYO build
 * would otherwise silently starve). The discovered record merges in via
 * `mergeCatalogueMetadata`, lighting up the trakt-id-keyed detail sections
 * (seasons, cast, studios) when Trakt answered, or the tmdb/imdb/mal ids
 * Simkl's answer carries otherwise. Shares its cache entry with the fan-out's
 * `cachedTraktLookup`.
 */
export function useTraktIdentityQuery(item: NormalizedMediaItem | undefined) {
  const tmdbId = item?.externalIds.tmdb;
  const kind = item?.type === 'TV' ? 'show' : 'movie';
  return useQuery({
    queryKey: mappingQueryKeys.traktLookup('tmdb', tmdbId ?? 0, kind),
    queryFn: () => traktOrSimklLookup({ source: 'tmdb', id: tmdbId ?? 0, kind }),
    ...FOREVER,
    enabled:
      item != null &&
      (item.type === 'MOVIE' || item.type === 'TV') &&
      item.externalIds.trakt == null &&
      tmdbId != null,
  });
}
