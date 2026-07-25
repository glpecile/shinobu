import { useSuspenseQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import { tmdbToken } from '@/state/session/tmdb-token';
import type { TmdbDeps } from '@/lib/providers/tmdb/deps';
import {
  getPerson,
  getStudio,
  searchCompany,
  searchPerson,
} from '@/lib/providers/tmdb/reads';

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
