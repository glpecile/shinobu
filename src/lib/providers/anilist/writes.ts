import { Effect } from 'effect';

import type { NormalizedMediaItem } from '@/types/media';
import { ProviderDecodeError, type ProviderError } from '@/lib/providers/errors';
import type { AniListDeps } from './deps';
import { anilistAuthedRequest } from './http';
import { getEntryState } from './reads';

export interface AniListLogOptions {
  /**
   * Episode (or chapter) progress to record — required for series, ignored
   * for films. Single-season scope: entry progress ≡ season-1 episode number
   * (plan 0011 decision 7).
   */
  progress?: number;
  /**
   * Parity rewatch (plan 0011): the entry already records this watch on every
   * provider, so films bump `repeat`, series re-enter `REPEATING` at
   * `progress`.
   */
  rewatch?: boolean;
}

interface SaveMediaListEntryResponse {
  SaveMediaListEntry: { id: number } | null;
}

/**
 * The AniList write adapter `useLogMedia` fans out to (todos/002). Reads the
 * viewer's current entry first because rewatch counters are absolute values
 * (`repeat: n`), not increments — the mutation needs the current count to
 * add one.
 */
export function logToAniList(
  deps: AniListDeps,
  item: NormalizedMediaItem,
  options: AniListLogOptions = {},
): Effect.Effect<void, ProviderError> {
  const mediaId = item.externalIds.anilist;
  if (mediaId == null) {
    return Effect.fail(
      new ProviderDecodeError({
        provider: 'anilist',
        detail: `"${item.title}" has no anilist id to log against`,
      }),
    );
  }

  // Film semantics for anime films *and* Trakt-origin movies that reverse-
  // mapped to an AniList entry; everything else logs as per-unit progress.
  const filmLike = item.isFilm === true || item.type === 'MOVIE';

  return Effect.gen(function* () {
    const state = yield* getEntryState(deps, { mediaId });

    let variables: Record<string, unknown>;
    if (filmLike) {
      variables = {
        mediaId,
        status: 'COMPLETED',
        ...(options.rewatch === true
          ? { repeat: (state.entry?.repeat ?? 0) + 1 }
          : {}),
      };
    } else {
      const progress = options.progress;
      if (progress == null || progress <= 0) {
        return yield* new ProviderDecodeError({
          provider: 'anilist',
          detail: `logging "${item.title}" requires an episode/chapter progress`,
        });
      }
      const total = state.episodes;
      const status =
        options.rewatch === true
          ? 'REPEATING'
          : total != null && progress >= total
            ? 'COMPLETED'
            : 'CURRENT';
      variables = { mediaId, status, progress };
    }

    const result = yield* anilistAuthedRequest<SaveMediaListEntryResponse>(
      deps,
      `mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $repeat: Int) {
        SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, repeat: $repeat) {
          id
        }
      }`,
      { variables },
    );
    if (result.SaveMediaListEntry?.id == null) {
      return yield* new ProviderDecodeError({
        provider: 'anilist',
        detail: `AniList did not save a list entry for "${item.title}"`,
      });
    }
  });
}
