import { Effect } from 'effect';

import { ProviderAuthError, type ProviderError } from '@/lib/providers/errors';
import type { NormalizedDiaryEntry } from '@/types/media';
import type { SerializdDeps } from './deps';
import { serializdHttp } from './http';
import { normalizeDiaryReview, type SerializdDiaryReview } from './normalize';

const provider = 'serializd' as const;

/** One page of the diary plus the server's total-page count (drives paging). */
export interface SerializdDiaryPage {
  entries: NormalizedDiaryEntry[];
  totalPages: number;
}

interface RawDiaryResponse {
  reviews?: SerializdDiaryReview[];
  totalPages?: number;
  totalReviews?: number;
}

/**
 * The next page param from a loaded page (R11): pages are 1-indexed, so page
 * `current` has a successor while `current < totalPages`, else `undefined`
 * (exhausted). Unlike Letterboxd's single RSS window this is a real paginated
 * infinite query.
 */
export function serializdNextPage(
  page: SerializdDiaryPage,
  current: number,
): number | undefined {
  return current < page.totalPages ? current + 1 : undefined;
}

/**
 * `GET /user/{username}/diary?page=N` → a normalized page (R11). Works on every
 * platform (native direct, web via the proxy — R13); the `EXPO_OS !== 'web'`
 * Letterboxd gate must NOT be copied. A missing session username is a dead
 * session (reconnect), never a silent empty diary.
 */
export function getSerializdDiary(
  deps: SerializdDeps,
  params: { page: number },
): Effect.Effect<SerializdDiaryPage, ProviderError> {
  const username = deps.session?.username;
  if (username == null || username === '') {
    return Effect.fail(new ProviderAuthError({ provider, refreshFailed: true }));
  }

  return Effect.gen(function* () {
    const raw = yield* serializdHttp<RawDiaryResponse>(
      deps,
      `/user/${encodeURIComponent(username)}/diary?page=${params.page}`,
    );
    const fetchedAt = new Date().toISOString();
    return {
      entries: (raw.reviews ?? []).map((review) =>
        normalizeDiaryReview(review, fetchedAt),
      ),
      totalPages: raw.totalPages ?? params.page,
    };
  });
}

/**
 * R12 helper: does this loaded diary slice already carry the intended episode's
 * entry? A Serializd log is a two-call sequence, so an episode present in
 * `/progress` but absent here means a partial write whose diary entry never
 * landed — reconcile must re-attempt it, not skip (AE6).
 */
export function diaryHasEpisode(
  entries: readonly NormalizedDiaryEntry[],
  params: { tmdbId: number; episodeNumber: number; season?: number },
): boolean {
  return entries.some(
    (entry) =>
      entry.item.externalIds.tmdb === params.tmdbId &&
      (entry.episodes ?? []).includes(params.episodeNumber) &&
      // Guard cross-season episode-number collisions (S1E5 vs S2E5): require the
      // season to match when both sides carry one. Reconcile prefers a duplicate
      // over a wrong skip (drop), so an unknown season never forces a match.
      (params.season == null || entry.season == null || entry.season === params.season),
  );
}
