import { Effect } from 'effect';

import type { ProviderError } from '@/lib/providers/errors';
import type { SerializdDeps } from './deps';
import { serializdHttp } from './http';

export interface RawProgressResponse {
  watchedSeasons?: Array<{
    seasonNumber?: number;
    watchedEpisodes?: number[];
  }>;
}

/**
 * `GET /user/{username}/show/{tmdbId}/progress`, **undigested** — the raw
 * `watchedSeasons` rows, season-number-keyed, before any flattening.
 *
 * Exists because the watchlist guard cannot be expressed in terms of
 * `getWatchedEpisodeKeys` (plan 0031 R21/KTD-10): that helper drops any season
 * whose `watchedEpisodes` is empty or absent, which is exactly the shape a
 * season marked watched wholesale (`POST /watched_v2`, no episode rows) takes.
 * A guard built on the flattened keys would therefore treat such a season as
 * never-touched and send it to `watchlist_v2` — failing **open** in the one
 * scenario it exists for. So the guard reads this instead and asks "does the
 * season appear in `watchedSeasons` at all?", a question the key set cannot
 * answer. `getWatchedEpisodeKeys` keeps its exact existing behaviour for the
 * log-path reconcile that wants episode granularity.
 */
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

/** Whether every intended episode is present in the watched key set. */
export function serializdHasEpisodes(
  keys: ReadonlySet<string>,
  episodes: readonly { season: number; number: number }[],
): boolean {
  return episodes.every((episode) => keys.has(`${episode.season}-${episode.number}`));
}
