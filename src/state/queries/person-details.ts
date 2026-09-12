import { useSuspenseQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { getPersonByName } from '@/lib/providers/person-details';
import { anilistDeps } from '@/state/queries/anilist';
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
    queryFn: () =>
      Effect.runPromise(
        getPersonByName(
          { tmdb: tmdbToken() === '' ? null : tmdbDeps(), anilist: anilistDeps() },
          { name },
        ),
      ),
    staleTime: PERSON_STALE_TIME_MS,
  });
}
