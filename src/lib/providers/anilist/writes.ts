import { Effect } from 'effect';

import type { ProviderWriteResult } from '@/features/log-media/fan-out';
import type { NormalizedMediaItem } from '@/types/media';
import { ProviderDecodeError, type ProviderError } from '@/lib/providers/errors';
import type { AniListDeps } from './deps';
import { anilistAuthedRequest } from './http';
import { getEntryState, type AniListEntryState } from './reads';

export interface AniListLogOptions {
  /**
   * Episode (or chapter) progress to record — required for series, ignored
   * for films.
   *
   * Always **entry-relative**: an AniList entry counts its own episodes from 1,
   * so a sequel-season entry's third episode is `progress: 3` here even though
   * Trakt and Serializd receive S02E03 for the same log (plan 0027 R2/KTD5).
   * The caller does that split — `useLogMedia` hands this adapter
   * `entryEpisodes` and the canonical batch to the others; it is *not*
   * "season-1 episode number" any more (plan 0011 decision 7's original scope).
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
const SAVE_MEDIA_LIST_ENTRY = `mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $repeat: Int) {
        SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, repeat: $repeat) {
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
      SAVE_MEDIA_LIST_ENTRY,
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

/**
 * The AniList watchlist adapter (plan 0031 R8/R16, KTD-2): record want-to-watch
 * as `status: PLANNING` — the same enum for anime and manga, since AniList has
 * one status field and no per-type variant.
 *
 * **Read-then-decide, and the decision is *refuse*, never overwrite.**
 * `MediaList.status` is single-valued, so writing `PLANNING` over an existing
 * entry moves a series out of Watching/Completed and is silent data loss. The
 * branches, in order, all of them inside this effect:
 *
 * 0. the guard read itself fails → the effect fails, so the fan-out reports an
 *    `error` outcome and the mutation is **never issued**. This guard is
 *    **fail-closed**, deliberately diverging from the log path's documented
 *    rule that "a failed state read counts as 'doesn't have it'"
 *    (`use-log-media.ts`): there the worst case is a duplicate history row,
 *    here it is a status clobber. Do not transfer that rule to this file.
 * 1. no entry → write `SaveMediaListEntry(mediaId, status: PLANNING)`.
 * 2. entry already `PLANNING` → reasoned skip.
 * 3. an entry in **any** other shape — any status, any progress, even
 *    `status: null, progress: 0` (an entry that exists only for a score, notes
 *    or a custom list) → reasoned skip, naming the status when there is one.
 *
 * So the rule is simply: **an entry that exists is never written over.** In
 * particular the guard is not "skip only if CURRENT" — `PAUSED`/`DROPPED` carry
 * progress the user chose to keep and `COMPLETED` is exactly the "you already
 * saw this" case a want-to-watch write must never contradict. Whether
 * `SaveMediaListEntry` nulls omitted fields is unverified (plan 0031 KTD-2's
 * named risk, U5); branch 3 is what makes that moot — the mutation only ever
 * runs against a non-existent entry, so no stored field is ever at risk.
 *
 * **Prohibition:** the guard is a fresh in-effect read, every time. Never
 * source it from the TanStack cache (`getQueryData`/`fetchQuery` against
 * `entryState`) and never from the cached watchlist aggregate
 * (`useIsWatchlisted`), whatever a cost argument suggests. A stale guard — the
 * user logged episodes on another device minutes ago — is a silent clobber,
 * which is the entire failure this guard exists to prevent. 1 read + 1 write is
 * the honest, unavoidable cost of an AniList watchlist add.
 */
export function planOnAniList(
  deps: AniListDeps,
  item: NormalizedMediaItem,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  const mediaId = item.externalIds.anilist;
  if (mediaId == null) {
    return Effect.fail(
      new ProviderDecodeError({
        provider: 'anilist',
        detail: `"${item.title}" has no anilist id to watchlist against`,
      }),
    );
  }

  return Effect.gen(function* () {
    // Branch 0. Fail-closed: the mutation is unreachable from here.
    const state = yield* getEntryState(deps, { mediaId }).pipe(
      Effect.mapError(
        (error) =>
          new ProviderDecodeError({
            provider: 'anilist',
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
        provider: 'anilist',
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

/**
 * Why this entry may not be deleted, as the trailing clause of the skip reason —
 * or `null` when it is a **bare** `PLANNING` entry and deletion is safe.
 *
 * The refusal set is deliberately wider than status + progress (plan 0031
 * R36.2). A `PLANNING` entry with `progress: 0` can still carry a score, notes,
 * a rewatch count, a start date or custom-list membership, and that is exactly
 * the entry content KTD-2 refuses to *write over* on the add side — deleting it
 * outright would be the same loss by another route. AniList has no "un-status"
 * that preserves an entry, so an entry carrying user content is a legitimately
 * manual case, not a delete.
 */
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
 * The AniList un-watchlist adapter (plan 0031 R34/R36): delete the viewer's
 * MediaList entry for `mediaId` — but only ever a **bare `PLANNING`** one.
 *
 * This is the mirror of `planOnAniList`'s guard, and "the mirror of KTD-2" has
 * to mean the whole of KTD-2, so the branches run in order inside this effect:
 *
 * 0. the guard read itself fails → the effect fails, so the fan-out reports an
 *    `error` outcome and the mutation is **never issued**. Fail-closed, the same
 *    deliberate divergence from the log path's "a failed state read counts as
 *    'doesn't have it'" rule (`use-log-media.ts`) that the add makes: there the
 *    worst case is a duplicate history row, here it is a destroyed entry.
 * 1. no entry → reasoned skip; there is nothing to remove.
 * 2. anything that is not a bare `PLANNING` entry → reasoned skip naming why,
 *    plus R17's manual `Remove on AniList` link from the outcome. See
 *    `refusalClause` for why the set is wider than status + progress.
 * 3. an entry that decodes without an `id` → reasoned skip: it is not a deletion
 *    target and the alternative is deleting an arbitrary id
 *    (`AniListEntryState.entry.id`).
 * 4. otherwise → `DeleteMediaListEntry(id)`.
 *
 * **Prohibition, load-bearing here in a way it is not anywhere else:** the guard
 * is a fresh in-effect `getEntryState`, every time, and the delete uses **the id
 * that read returned** — never the cached `entryId` carried on
 * `AniListCurrentEntry`, which is a convenience hint for the surface and can
 * point at an entry since re-created, and never the cached watchlist aggregate,
 * which carries `WATCHLIST_STALE_MS` (15 min). A user who starts a show on
 * anilist.co at 10:05 and taps Remove at 10:07 would otherwise have the 10:00
 * `PLANNING`/0 snapshot evaluated and the whole entry destroyed, progress, score
 * and all. An AniList remove is 1 read + 1 mutation, the same honest cost as the
 * add.
 */
export function deleteAniListEntry(
  deps: AniListDeps,
  params: { mediaId: number },
): Effect.Effect<ProviderWriteResult, ProviderError> {
  return Effect.gen(function* () {
    // Branch 0. Fail-closed: the mutation is unreachable from here.
    const state = yield* getEntryState(deps, { mediaId: params.mediaId }).pipe(
      Effect.mapError(
        (error) =>
          new ProviderDecodeError({
            provider: 'anilist',
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
    // Branch 2.
    const refusal = refusalClause(entry);
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

    // Branch 4. Bare PLANNING, and the id is the fresh read's, not a cached one.
    const result = yield* anilistAuthedRequest<DeleteMediaListEntryResponse>(
      deps,
      DELETE_MEDIA_LIST_ENTRY,
      { variables: { id: entry.id } },
    );
    if (result.DeleteMediaListEntry?.deleted !== true) {
      return yield* new ProviderDecodeError({
        provider: 'anilist',
        detail: 'AniList did not delete the list entry',
      });
    }
    return { status: 'ok' } satisfies ProviderWriteResult;
  });
}
