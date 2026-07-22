import { Effect } from 'effect';

import { ProviderNetworkError, type ProviderError } from '@/lib/providers/errors';
import type { SerializdDeps } from './deps';
import { serializdHttp } from './http';

/**
 * Season numbers ≥ 2000 are almost always calendar years (a year-based season
 * layout Serializd's TMDB-keyed catalogue has no equivalent for) — a permanent,
 * un-writable skip (KTD6/Appendix), decided without a network round-trip.
 */
export const YEAR_SEASON_THRESHOLD = 2000;

export function isYearBasedSeason(seasonNumber: number): boolean {
  return seasonNumber >= YEAR_SEASON_THRESHOLD;
}

interface RawSeasonResponse {
  /** `null` when Serializd hasn't ingested this season yet (transient, KTD6). */
  seasonId?: number | null;
}

/**
 * `GET /show/{tmdbId}/season/{n}` → the Serializd `seasonId` a write keys on,
 * or `null` when the season is unavailable (a `seasonId: null` body or a 404).
 * A `null` is often transient catalogue lag for a currently-airing season, so
 * the caller re-resolves rather than caching the miss forever (KTD6); a real
 * write self-heals because it re-resolves on every log.
 */
export function resolveSeasonId(
  deps: SerializdDeps,
  params: { tmdbId: number; seasonNumber: number },
): Effect.Effect<number | null, ProviderError> {
  return Effect.gen(function* () {
    const raw = yield* serializdHttp<RawSeasonResponse>(
      deps,
      `/show/${params.tmdbId}/season/${params.seasonNumber}`,
    ).pipe(
      // A 404 for an as-yet-unlisted season is a miss, not an error — the show
      // exists, the season just isn't ingested. Any other error propagates.
      Effect.catchAll((error) =>
        error instanceof ProviderNetworkError &&
        / 404 /.test(String((error.cause as Error | undefined)?.message ?? ''))
          ? Effect.succeed<RawSeasonResponse>({ seasonId: null })
          : Effect.fail(error),
      ),
    );
    return raw.seasonId ?? null;
  });
}
