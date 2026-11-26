import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { httpFetch } from '@/lib/http/client';
import { tmdbToken } from '@/state/session/tmdb-token';
import type { TmdbDeps } from '@/lib/providers/tmdb/deps';
import { searchTitlesFuzzy } from '@/lib/providers/tmdb/fuzzy-search';
import {
  getCreditEpisodes,
  getPerson,
  getStudio,
  getTvEpisode,
  searchCompany,
  searchPerson,
} from '@/lib/providers/tmdb/reads';
import { SEARCH_QUERY_ROOTS } from '@/state/queries/search-cache';
import { SEARCH_MIN_QUERY_LENGTH } from '@/state/queries/trakt';

export function tmdbDeps(): TmdbDeps {
  return {
    fetch: httpFetch,
    token: tmdbToken(),
  };
}

export const tmdbQueryKeys = {
  all: ['tmdb'] as const,
  personRoot: () => [...tmdbQueryKeys.all, 'person'] as const,
  person: (tmdbId: number) => [...tmdbQueryKeys.personRoot(), tmdbId] as const,
  personSearch: (name: string) => [...tmdbQueryKeys.all, 'person-search', name] as const,
  studioRoot: () => [...tmdbQueryKeys.all, 'studio'] as const,
  studio: (tmdbId: number) => [...tmdbQueryKeys.studioRoot(), tmdbId] as const,
  studioSearch: (name: string) => [...tmdbQueryKeys.all, 'studio-search', name] as const,
  /** Keyed by kind and id because TMDB numbers movies and TV in separate id spaces. */
  catalogue: (kind: 'movie' | 'tv', tmdbId: number) =>
    [...tmdbQueryKeys.all, 'catalogue', kind, tmdbId] as const,
  seasons: (tmdbId: number) => [...tmdbQueryKeys.all, 'seasons', tmdbId] as const,
  creditEpisodes: (creditId: string) =>
    [...tmdbQueryKeys.all, 'credit-episodes', creditId] as const,
  episode: (tmdbId: number, season: number, number: number) =>
    [...tmdbQueryKeys.all, 'episode', tmdbId, season, number] as const,
  search: (query: string) => [...SEARCH_QUERY_ROOTS.tmdb, query] as const,
};

const PERSON_STALE_TIME_MS = 24 * 60 * 60 * 1000;

export function useSuspenseTmdbPersonQuery(params: { tmdbId: number }) {
  return useSuspenseQuery({
    queryKey: tmdbQueryKeys.person(params.tmdbId),
    queryFn: ({ signal }) =>
      Effect.runPromise(getPerson(tmdbDeps(), { tmdbId: params.tmdbId }), { signal }),
    staleTime: PERSON_STALE_TIME_MS,
    gcTime: PERSON_STALE_TIME_MS,
  });
}

export function useTmdbPersonQuery(params: { tmdbId: number | undefined; enabled?: boolean }) {
  const { tmdbId } = params;
  return useQuery({
    queryKey: tmdbQueryKeys.person(tmdbId ?? 0),
    queryFn: ({ signal }) =>
      Effect.runPromise(getPerson(tmdbDeps(), { tmdbId: tmdbId as number }), { signal }),
    enabled: tmdbId != null && params.enabled !== false,
    staleTime: PERSON_STALE_TIME_MS,
    gcTime: PERSON_STALE_TIME_MS,
  });
}

export function useTmdbCreditEpisodesQuery(params: { creditId: string; enabled: boolean }) {
  return useQuery({
    queryKey: tmdbQueryKeys.creditEpisodes(params.creditId),
    queryFn: ({ signal }) =>
      Effect.runPromise(getCreditEpisodes(tmdbDeps(), { creditId: params.creditId }), { signal }),
    enabled: params.enabled,
    staleTime: PERSON_STALE_TIME_MS,
    gcTime: PERSON_STALE_TIME_MS,
  });
}

function episodeQueryOptions(params: { tmdbId: number; season: number; number: number }) {
  return {
    queryKey: tmdbQueryKeys.episode(params.tmdbId, params.season, params.number),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      Effect.runPromise(getTvEpisode(tmdbDeps(), params), { signal }),
    staleTime: PERSON_STALE_TIME_MS,
    gcTime: PERSON_STALE_TIME_MS,
  };
}

export function usePrefetchTmdbEpisode() {
  const queryClient = useQueryClient();
  return (params: { tmdbId: number | undefined; season: number; number: number }) => {
    const { tmdbId } = params;
    if (tmdbId == null || tmdbToken() === '') return;
    void queryClient.prefetchQuery(episodeQueryOptions({ ...params, tmdbId }));
  };
}

export function useSuspenseTmdbEpisodeQuery(params: {
  tmdbId: number;
  season: number;
  number: number;
}) {
  return useSuspenseQuery(episodeQueryOptions(params));
}

export function useTmdbEpisodeQuery(params: {
  tmdbId: number | undefined;
  season: number;
  number: number;
  enabled?: boolean;
}) {
  const { tmdbId } = params;
  return useQuery({
    ...episodeQueryOptions({
      tmdbId: tmdbId ?? 0,
      season: params.season,
      number: params.number,
    }),
    enabled: tmdbId != null && params.enabled !== false,
  });
}

export function useTmdbSearchQuery(params: { query: string; enabled?: boolean }) {
  const query = params.query.trim();
  return useQuery({
    queryKey: tmdbQueryKeys.search(query),
    queryFn: ({ signal }) =>
      Effect.runPromise(searchTitlesFuzzy(tmdbDeps(), { query }), { signal }),
    enabled: params.enabled !== false && query.length >= SEARCH_MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useTmdbPersonSearchQuery(params: { query: string; enabled: boolean }) {
  const query = params.query.trim();
  return useQuery({
    queryKey: tmdbQueryKeys.personSearch(query),
    queryFn: ({ signal }) => Effect.runPromise(searchPerson(tmdbDeps(), { query }), { signal }),
    enabled: params.enabled && query.length >= SEARCH_MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useTmdbStudioSearchQuery(params: { query: string; enabled: boolean }) {
  const query = params.query.trim();
  return useQuery({
    queryKey: tmdbQueryKeys.studioSearch(query),
    queryFn: ({ signal }) => Effect.runPromise(searchCompany(tmdbDeps(), { query }), { signal }),
    enabled: params.enabled && query.length >= SEARCH_MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useSuspenseTmdbPersonSearchQuery(params: { name: string }) {
  return useSuspenseQuery({
    queryKey: tmdbQueryKeys.personSearch(params.name),
    queryFn: ({ signal }) =>
      Effect.runPromise(searchPerson(tmdbDeps(), { query: params.name }), { signal }),
    staleTime: PERSON_STALE_TIME_MS,
    gcTime: PERSON_STALE_TIME_MS,
  });
}

export function useSuspenseTmdbStudioQuery(params: { tmdbId: number }) {
  return useSuspenseQuery({
    queryKey: tmdbQueryKeys.studio(params.tmdbId),
    queryFn: ({ signal }) =>
      Effect.runPromise(getStudio(tmdbDeps(), { tmdbId: params.tmdbId }), { signal }),
    staleTime: PERSON_STALE_TIME_MS,
    gcTime: PERSON_STALE_TIME_MS,
  });
}

export function useSuspenseTmdbStudioSearchQuery(params: { name: string }) {
  return useSuspenseQuery({
    queryKey: tmdbQueryKeys.studioSearch(params.name),
    queryFn: ({ signal }) =>
      Effect.runPromise(searchCompany(tmdbDeps(), { query: params.name }), { signal }),
    staleTime: PERSON_STALE_TIME_MS,
    gcTime: PERSON_STALE_TIME_MS,
  });
}
