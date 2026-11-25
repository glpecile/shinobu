import * as Effect from 'effect/Effect';

import type { ProviderError } from '@/lib/providers/errors';
import type { SerializdDeps } from './deps';
import { serializdHttp } from './http';

export interface RawProgressResponse {
  watchedSeasons?: Array<{
    seasonNumber?: number;
    watchedEpisodes?: number[];
  }>;
}

/** Keep raw watched-season rows. A season marked watched wholesale may have no episode keys. */
export function getRawShowProgress(
  deps: SerializdDeps,
  params: { tmdbId: number },
): Effect.Effect<RawProgressResponse, ProviderError> {
  return serializdHttp<RawProgressResponse>(
    deps,
    `/user/${encodeURIComponent(deps.session?.username ?? '')}/show/${params.tmdbId}/progress`,
    { auth: true },
  );
}

/**
 * `GET /user/{username}/show/{tmdbId}/progress` → the set of watched
 * `${season}-${episode}` keys (R12), mirroring Trakt's `normalizeWatchedProgress`
 * key set so the fan-out reconcile helpers read uniformly. Episode-watched is a
 * *necessary* but not *sufficient* signal for "fully logged" — see
 * `diaryHasEpisode` (a Serializd log is a two-call sequence, R8/R12).
 */
export function getWatchedEpisodeKeys(
  deps: SerializdDeps,
  params: { tmdbId: number },
): Effect.Effect<Set<string>, ProviderError> {
  return Effect.gen(function* () {
    const raw = yield* getRawShowProgress(deps, params);
    const keys = new Set<string>();
    for (const season of raw.watchedSeasons ?? []) {
      if (season.seasonNumber == null) continue;
      for (const episode of season.watchedEpisodes ?? []) {
        keys.add(`${season.seasonNumber}-${episode}`);
      }
    }
    return keys;
  });
}

export function serializdHasEpisodes(
  keys: ReadonlySet<string>,
  episodes: readonly { season: number; number: number }[],
): boolean {
  return episodes.every((episode) => keys.has(`${episode.season}-${episode.number}`));
}
