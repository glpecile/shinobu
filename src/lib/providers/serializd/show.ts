import { Effect } from 'effect';

import type { ProviderError } from '@/lib/providers/errors';
import type { SerializdDeps } from './deps';
import { serializdHttp } from './http';

/**
 * The slice of `GET /show/{tmdbId}` the watchlist guard needs — the per-season
 * `id` ↔ `seasonNumber` join and the season's `episodeCount`.
 *
 * **The body shape is UNVERIFIED.** Nothing in the repo read show details
 * before this (only `resolveSeasonId`, one `GET /show/{tmdbId}/season/{n}` per
 * season), and the evidence for these fields is serializd-py's `log_show`
 * (`client.py:172-176`), not an observed response. U10 captures a real body and
 * confirms that it carries per-season **ids** and `episodeCount`. If it does
 * not, the documented fallback is `resolveSeasonId` per season, which makes a
 * watchlist add cost **2 + N** requests instead of 3 (KTD-10, and the
 * Assumptions' cost model) — a reason to reconsider, not a silent degradation.
 *
 * Every field is optional on purpose: a missing `id` or `seasonNumber` makes a
 * season unusable to the guard, and the guard drops it rather than guessing
 * (KTD-10's join is `seasonNumber` ↔ `id`, and a wrong id would watchlist the
 * wrong season).
 */
export interface RawShowResponse {
  seasons?: Array<{ id?: number; seasonNumber?: number; episodeCount?: number }>;
}

/**
 * `GET /show/{tmdbId}` → the show's season list, the enumeration half of the
 * Serializd watchlist write (KTD-7: `season_ids` is required, so "show-level"
 * on Serializd means *all seasons*, and only this read knows what those are).
 *
 * Unauthenticated, like `resolveSeasonId` — the catalogue is public and the
 * path sits inside the pre-existing `show/` GET prefix of the Worker allowlist,
 * so the web relay needed no grant for it (KTD-9). Errors propagate: a failed
 * enumeration is branch 0 of KTD-10's guard (fail-closed, no write), never an
 * empty season list.
 */
export function getSerializdShow(
  deps: SerializdDeps,
  params: { tmdbId: number },
): Effect.Effect<RawShowResponse, ProviderError> {
  return serializdHttp<RawShowResponse>(deps, `/show/${params.tmdbId}`);
}
