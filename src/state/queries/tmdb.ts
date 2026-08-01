import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import { tmdbToken } from '@/state/session/tmdb-token';
import type { TmdbDeps } from '@/lib/providers/tmdb/deps';
import {
  getPerson,
  getStudio,
  searchCompany,
  searchPerson,
  searchTitles,
} from '@/lib/providers/tmdb/reads';
import { SEARCH_QUERY_ROOTS } from '@/state/queries/search-cache';
import { SEARCH_MIN_QUERY_LENGTH } from '@/state/queries/trakt';

/** Real dependency wiring for TMDB effects (same shape as `traktDeps`). */
export function tmdbDeps(): TmdbDeps {
  return {
    fetch: httpFetch,
    token: tmdbToken(),
  };
}

export const tmdbQueryKeys = {
  all: ['tmdb'] as const,
  /** Prefix for every person page — details/[id] scans this for cache hits. */
  personRoot: () => [...tmdbQueryKeys.all, 'person'] as const,
  person: (tmdbId: number) => [...tmdbQueryKeys.personRoot(), tmdbId] as const,
  personSearch: (name: string) =>
    [...tmdbQueryKeys.all, 'person-search', name] as const,
  /** Prefix for every studio page — details/[id] scans this too. */
  studioRoot: () => [...tmdbQueryKeys.all, 'studio'] as const,
  studio: (tmdbId: number) => [...tmdbQueryKeys.studioRoot(), tmdbId] as const,
  studioSearch: (name: string) =>
    [...tmdbQueryKeys.all, 'studio-search', name] as const,
  /**
   * One title's catalogue record (`getMediaCatalogue`). Keyed by kind *and* id
   * because TMDB numbers movies and shows in separate spaces — id 550 is a film
   * and a series, and one key would serve one as the other.
   */
  catalogue: (kind: 'movie' | 'tv', tmdbId: number) =>
    [...tmdbQueryKeys.all, 'catalogue', kind, tmdbId] as const,
  /** Full seasons + episodes for one show (`getTvSeasons`) — the Trakt-less
   *  leg of `state/queries/show-seasons.ts`. */
  seasons: (tmdbId: number) =>
    [...tmdbQueryKeys.all, 'seasons', tmdbId] as const,
  /** Derived from SEARCH_QUERY_ROOTS so the details cache scan finds results. */
  search: (query: string) => [...SEARCH_QUERY_ROOTS.tmdb, query] as const,
};

// People's filmographies barely churn — a day of staleness is invisible, and
// it keeps back-navigation between a filmography and its person page free.
const PERSON_STALE_TIME_MS = 24 * 60 * 60 * 1000;

/** Bio + role-grouped credit rows for the `/person/[id]` route. */
export function useSuspenseTmdbPersonQuery(params: { tmdbId: number }) {
  return useSuspenseQuery({
    queryKey: tmdbQueryKeys.person(params.tmdbId),
    queryFn: () =>
      Effect.runPromise(getPerson(tmdbDeps(), { tmdbId: params.tmdbId })),
    staleTime: PERSON_STALE_TIME_MS,
  });
}

/**
 * The non-suspending sibling: the credit sheet opens on a long-press with no
 * route transition behind it, so it must render its header instantly from the
 * credit it was handed and let the bio arrive after. Same key and staleness as
 * the route query, so opening the sheet warms the person page and vice versa.
 */
export function useTmdbPersonQuery(params: {
  tmdbId: number | undefined;
  enabled?: boolean;
}) {
  const { tmdbId } = params;
  return useQuery({
    queryKey: tmdbQueryKeys.person(tmdbId ?? 0),
    queryFn: () =>
      Effect.runPromise(getPerson(tmdbDeps(), { tmdbId: tmdbId as number })),
    enabled: tmdbId != null && params.enabled !== false,
    staleTime: PERSON_STALE_TIME_MS,
  });
}

/**
 * Movie+TV text search for the search tab (`/search/multi`), the section's
 * primary source — same debounce/keepPreviousData contract as the Trakt
 * search it replaces. Disabled without a TMDB token; the screen falls back
 * to Trakt search only when a Trakt client key is active.
 */
export function useTmdbSearchQuery(params: {
  query: string;
  enabled?: boolean;
}) {
  const query = params.query.trim();
  return useQuery({
    queryKey: tmdbQueryKeys.search(query),
    queryFn: () => Effect.runPromise(searchTitles(tmdbDeps(), { query })),
    enabled:
      params.enabled !== false && query.length >= SEARCH_MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** Name → candidate people, for the `/person/lookup` resolution route. */
export function useSuspenseTmdbPersonSearchQuery(params: { name: string }) {
  return useSuspenseQuery({
    queryKey: tmdbQueryKeys.personSearch(params.name),
    queryFn: () =>
      Effect.runPromise(searchPerson(tmdbDeps(), { query: params.name })),
    staleTime: PERSON_STALE_TIME_MS,
  });
}

/** Company profile + works rows for the `/studio/[id]` route. */
export function useSuspenseTmdbStudioQuery(params: { tmdbId: number }) {
  return useSuspenseQuery({
    queryKey: tmdbQueryKeys.studio(params.tmdbId),
    queryFn: () =>
      Effect.runPromise(getStudio(tmdbDeps(), { tmdbId: params.tmdbId })),
    staleTime: PERSON_STALE_TIME_MS,
  });
}

/** Name → candidate companies, for the `/studio/lookup` resolution route. */
export function useSuspenseTmdbStudioSearchQuery(params: { name: string }) {
  return useSuspenseQuery({
    queryKey: tmdbQueryKeys.studioSearch(params.name),
    queryFn: () =>
      Effect.runPromise(searchCompany(tmdbDeps(), { query: params.name })),
    staleTime: PERSON_STALE_TIME_MS,
  });
}
