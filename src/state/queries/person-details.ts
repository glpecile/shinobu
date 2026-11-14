import { useSuspenseQuery } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { getAniListStaff } from '@/lib/providers/anilist/reads';
import { getPersonByName } from '@/lib/providers/person-details';
import { getPersonByImdbId } from '@/lib/providers/tmdb/reads';
import { anilistDeps, anilistQueryKeys } from '@/state/queries/anilist';
import { tmdbDeps } from '@/state/queries/tmdb';
import { tmdbToken } from '@/state/session/tmdb-token';

/** Same budget as `tmdb.ts`' person reads — a filmography barely churns. */
const PERSON_STALE_TIME_MS = 24 * 60 * 60 * 1000;

/**
 * The `/person/lookup` route's whole read. One query rather than a chain of
 * suspending hooks, so the route suspends *once* and its skeleton stays up
 * across both legs instead of restarting between them.
 */
export function useSuspensePersonByNameQuery(params: { name: string }) {
  const name = params.name.trim();
  return useSuspenseQuery({
    queryKey: ['person-by-name', name],
    queryFn: ({ signal }) =>
      Effect.runPromise(
        getPersonByName(
          { tmdb: tmdbToken() === '' ? null : tmdbDeps(), anilist: anilistDeps() },
          { name },
        ),
        { signal },
      ),
    staleTime: PERSON_STALE_TIME_MS,
    gcTime: PERSON_STALE_TIME_MS,
  });
}

/** `/person/anilist/<id>`: an AniList credit's own profile, no name search. Public. */
export function useSuspenseAniListStaffQuery(params: { id: number }) {
  return useSuspenseQuery({
    queryKey: anilistQueryKeys.staff(params.id),
    queryFn: ({ signal }) => Effect.runPromise(getAniListStaff(anilistDeps(), { id: params.id }), { signal }),
    staleTime: PERSON_STALE_TIME_MS,
    gcTime: PERSON_STALE_TIME_MS,
  });
}

/**
 * `/person/imdb/<nm id>`: the TMDB person behind an IMDb link, or null when
 * TMDB has no match. Without a token it fails into the route's retry view, so
 * saving a token and retrying recovers. One query, so the route suspends once.
 */
export function useSuspenseImdbPersonQuery(params: { imdbId: string }) {
  return useSuspenseQuery({
    queryKey: ['person-by-imdb', params.imdbId],
    queryFn: ({ signal }) => Effect.runPromise(getPersonByImdbId(tmdbDeps(), params), { signal }),
    staleTime: PERSON_STALE_TIME_MS,
    gcTime: PERSON_STALE_TIME_MS,
  });
}
