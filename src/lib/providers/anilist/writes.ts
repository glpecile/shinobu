import * as Effect from 'effect/Effect';

import type { ProviderWriteResult } from '@/features/log-media/fan-out';
import { trackingStatusSkip } from '@/lib/providers/tracking-status';
import { Provider, type TrackingStatus } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';
import { ProviderDecodeError, type ProviderError } from '@/lib/providers/errors';
import type { AniListDeps } from './deps';
import { anilistAuthedRequest } from './http';
import { getEntryState, type AniListEntryState } from './reads';

export interface AniListLogOptions {
  /** AniList accepts entry-relative episode or chapter progress. A film has no progress count. */
  progress?: number;
  /**
   * Parity rewatch (plan 0011): the entry already records this watch on every
   * provider, so films bump `repeat`, series re-enter `REPEATING` at
   * `progress`.
   */
  rewatch?: boolean;
  /**
   * A Hardcover book bridged to this entry (plan 0117 B5): volume `number`,
   * and whether this log finishes it. Pages and chapters never convert
   * (KTD-3), so only a finish writes a number, as `progressVolumes`.
   */
  volume?: { number: number; finished: boolean };
}

interface SaveMediaListEntryResponse {
  SaveMediaListEntry: { id: number } | null;
}

interface DeleteMediaListEntryResponse {
  DeleteMediaListEntry: { deleted: boolean } | null;
}

/**
 * The one mutation document the log and watchlist-add verbs send. Every
 * argument is nullable-and-omittable, so the log verb passes `progress`/`repeat`
 * and the watchlist verb (plan 0031 KTD-2) passes neither — it only ever runs
 * where no entry exists, so there is nothing stored for an omitted field to
 * null.
 */
const SAVE_MEDIA_LIST_ENTRY = `mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $progressVolumes: Int, $repeat: Int) {
        SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, progressVolumes: $progressVolumes, repeat: $repeat) {
          id
        }
      }`;

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
        provider: Provider.AniList,
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
    if (options.volume != null) {
      const status = state.entry?.status ?? null;
      if (!options.volume.finished) {
        // A start or a page makes the entry Reading. Never a downgrade.
        if (status === 'CURRENT' || status === 'REPEATING' || status === 'COMPLETED') return;
        variables = { mediaId, status: 'CURRENT' };
      } else {
        const last = state.volumes != null && options.volume.number >= state.volumes;
        // The last volume completes the entry, as the last chapter does (M1).
        // A reread of a completed entry runs REPEATING from its own volume
        // until then, and finishing it counts it. `rewatch` comes from
        // Hardcover's one volume, so it never starts a reread on its own.
        const rereading = status === 'REPEATING' || (options.rewatch === true && status === 'COMPLETED');
        const next = last
          ? 'COMPLETED'
          : rereading
            ? 'REPEATING'
            : status === 'COMPLETED'
              ? 'COMPLETED'
              : 'CURRENT';
        variables = {
          mediaId,
          status: next,
          progressVolumes:
            next === 'REPEATING' && status !== 'REPEATING'
              ? options.volume.number
              : Math.max(options.volume.number, state.entry?.progressVolumes ?? 0),
          ...(last && rereading ? { repeat: (state.entry?.repeat ?? 0) + 1 } : {}),
        };
      }
    } else if (filmLike) {
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
          provider: Provider.AniList,
          detail: `logging "${item.title}" requires an episode/chapter progress`,
        });
      }
      const total = state.total;
      const finished = total != null && progress >= total;
      // A reread in progress stays REPEATING until it reaches the total.
      const status =
        options.rewatch === true || (state.entry?.status === 'REPEATING' && !finished)
          ? 'REPEATING'
          : finished
            ? 'COMPLETED'
            : 'CURRENT';
      variables = { mediaId, status, progress };
    }

    const result = yield* anilistAuthedRequest<SaveMediaListEntryResponse>(
      deps,
      SAVE_MEDIA_LIST_ENTRY,
      { variables },
    );
    if (result.SaveMediaListEntry?.id == null) {
      return yield* new ProviderDecodeError({
        provider: Provider.AniList,
        detail: `AniList did not save a list entry for "${item.title}"`,
      });
    }
  });
}

/**
 * Add Planning only when a fresh read shows no entry. An existing entry can hold status,
 * progress, or notes, so a failed read stops the write.
 */
export function planOnAniList(
  deps: AniListDeps,
  item: NormalizedMediaItem,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  const mediaId = item.externalIds.anilist;
  if (mediaId == null) {
    return Effect.fail(
      new ProviderDecodeError({
        provider: Provider.AniList,
        detail: `"${item.title}" has no anilist id to watchlist against`,
      }),
    );
  }

  return Effect.gen(function* () {
    const state = yield* getEntryState(deps, { mediaId }).pipe(
      Effect.mapError(
        (error) =>
          new ProviderDecodeError({
            provider: Provider.AniList,
            detail: `could not check your AniList entry for "${item.title}" — ${error.message}`,
          }),
      ),
    );

    const entry = state.entry;
    // Branch 2.
    if (entry?.status === 'PLANNING') {
      return {
        status: 'skipped',
        reason: 'already on your AniList planning list',
      } satisfies ProviderWriteResult;
    }
    // Branch 3. Any entry at all, in any shape.
    if (entry != null) {
      return {
        status: 'skipped',
        reason:
          entry.status == null
            ? 'AniList already tracks this'
            : `AniList already tracks this as ${entry.status}`,
      } satisfies ProviderWriteResult;
    }

    // Branch 1. Nothing exists, so nothing can be destroyed.
    const result = yield* anilistAuthedRequest<SaveMediaListEntryResponse>(
      deps,
      SAVE_MEDIA_LIST_ENTRY,
      { variables: { mediaId, status: 'PLANNING' } },
    );
    if (result.SaveMediaListEntry?.id == null) {
      return yield* new ProviderDecodeError({
        provider: Provider.AniList,
        detail: `AniList did not save a list entry for "${item.title}"`,
      });
    }
    return { status: 'ok' } satisfies ProviderWriteResult;
  });
}

const ANILIST_TRACKING_STATUS = { paused: 'PAUSED', dropped: 'DROPPED' } as const;

const ANILIST_STATUS_NAMES: Record<string, string> = {
  CURRENT: 'current',
  REPEATING: 'a rewatch',
  PAUSED: 'paused',
  DROPPED: 'dropped',
  COMPLETED: 'completed',
  PLANNING: 'planning',
};

/**
 * Pause or drop. It sends only `mediaId` and `status`, the same partial
 * update the log sends, so nothing else on the entry is written. A bridged
 * book changes its manga entry's status and never its volume count. A rewatch is a skip: pausing it
 * would end the rewatch, and the next log would not count it.
 */
export function setAniListTrackingStatus(
  deps: AniListDeps,
  item: NormalizedMediaItem,
  status: TrackingStatus,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  const mediaId = item.externalIds.anilist;
  if (mediaId == null) {
    return Effect.fail(
      new ProviderDecodeError({
        provider: Provider.AniList,
        detail: `"${item.title}" has no anilist id to ${status === 'paused' ? 'pause' : 'drop'}`,
      }),
    );
  }
  const target = ANILIST_TRACKING_STATUS[status];
  return Effect.gen(function* () {
    const { entry } = yield* getEntryState(deps, { mediaId });
    const reason = trackingStatusSkip(
      Provider.AniList,
      entry?.status ?? null,
      target,
      ['CURRENT', 'PAUSED', 'DROPPED'],
      (name) => ANILIST_STATUS_NAMES[name] ?? name.toLowerCase(),
    );
    if (reason != null) return { status: 'skipped', reason } satisfies ProviderWriteResult;
    const result = yield* anilistAuthedRequest<SaveMediaListEntryResponse>(
      deps,
      SAVE_MEDIA_LIST_ENTRY,
      { variables: { mediaId, status: target } },
    );
    if (result.SaveMediaListEntry?.id == null) {
      return yield* new ProviderDecodeError({
        provider: Provider.AniList,
        detail: `AniList did not save a list entry for "${item.title}"`,
      });
    }
    return { status: 'ok' } satisfies ProviderWriteResult;
  });
}

/**
 * `DeleteMediaListEntry` takes the **MediaList entry** id, not the media id
 * (plan 0031 R34, live introspection 2026-07-28). It is the only AniList verb
 * that destroys rather than overwrites, which is why every branch above it
 * exists.
 */
const DELETE_MEDIA_LIST_ENTRY = `mutation ($id: Int) {
        DeleteMediaListEntry(id: $id) {
          deleted
        }
      }`;

/** Return the data loss reason for a non-bare entry, or null when an ordinary removal is safe. */
function refusalClause(entry: NonNullable<AniListEntryState['entry']>): string | null {
  if (entry.status !== 'PLANNING') {
    return entry.status == null ? 'which is not a planning entry' : `which is ${entry.status}`;
  }
  if (entry.progress > 0) return 'which has recorded progress';
  if (entry.repeat > 0) return 'which records a rewatch';
  if (entry.score !== 0) return 'which carries a score';
  if (entry.notes != null && entry.notes.trim() !== '') return 'which carries notes';
  if (
    entry.startedAt != null &&
    (entry.startedAt.year != null ||
      entry.startedAt.month != null ||
      entry.startedAt.day != null)
  ) {
    // AniList start dates are fuzzy — a year-only date is still a date the user
    // put there, so any non-null component counts.
    return 'which has a start date';
  }
  if (entry.customLists.length > 0) return 'which is on a custom list';
  return null;
}

/**
 * AniList removal deletes the whole MediaList entry. Use the row id from a fresh read and fail
 * closed if it fails. Destructive removal requires explicit caller confirmation and still
 * requires that fresh read and id.
 */
export function deleteAniListEntry(
  deps: AniListDeps,
  params: { mediaId: number; allowDestructive?: boolean },
): Effect.Effect<ProviderWriteResult, ProviderError> {
  return Effect.gen(function* () {
    // Branch 0. Fail-closed: the mutation is unreachable from here.
    const state = yield* getEntryState(deps, { mediaId: params.mediaId }).pipe(
      Effect.mapError(
        (error) =>
          new ProviderDecodeError({
            provider: Provider.AniList,
            detail: `could not check your AniList entry — ${error.message}`,
          }),
      ),
    );

    const entry = state.entry;
    // Branch 1.
    if (entry == null) {
      return {
        status: 'skipped',
        reason: "wasn't on your AniList list",
      } satisfies ProviderWriteResult;
    }
    // Branch 2 — skipped wholesale under `allowDestructive`, where the user has
    // already been told this deletes the entry and said yes anyway. If the
    // fresh read turned out bare after all, the delete was safe regardless.
    const refusal = params.allowDestructive === true ? null : refusalClause(entry);
    if (refusal != null) {
      return {
        status: 'skipped',
        reason: `removing would delete your whole AniList entry, ${refusal}`,
      } satisfies ProviderWriteResult;
    }
    // Branch 3.
    if (entry.id == null) {
      return {
        status: 'skipped',
        reason: 'your AniList entry has no id to remove by',
      } satisfies ProviderWriteResult;
    }

    // Branch 4. Bare PLANNING (or a confirmed destructive removal), and the id
    // is the fresh read's, not a cached one.
    const result = yield* anilistAuthedRequest<DeleteMediaListEntryResponse>(
      deps,
      DELETE_MEDIA_LIST_ENTRY,
      { variables: { id: entry.id } },
    );
    if (result.DeleteMediaListEntry?.deleted !== true) {
      return yield* new ProviderDecodeError({
        provider: Provider.AniList,
        detail: 'AniList did not delete the list entry',
      });
    }
    return { status: 'ok' } satisfies ProviderWriteResult;
  });
}
