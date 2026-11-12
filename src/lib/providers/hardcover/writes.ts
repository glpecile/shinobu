import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { ProviderWriteResult } from '@/features/log-media/fan-out';
import {
  ProviderDecodeError,
  ProviderNetworkError,
  type ProviderError,
} from '@/lib/providers/errors';
import { optionalNullable } from '@/lib/providers/schema';
import { Provider } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';
import type { HardcoverDeps } from './deps';
import { hardcoverRequest } from './http';
import { getBookEntry, HardcoverStatus } from './reads';

const provider = Provider.Hardcover;

/**
 * Every write here lands on a member's real Hardcover account. Hardcover
 * writes the journal entry for each start, progress update and finish itself,
 * so nothing here writes a journal entry.
 *
 * Each mutation answers `{ error }` with a 200 when Hardcover refuses it.
 */
const ADD_BOOK = `mutation AddBook($object: UserBookCreateInput!) {
  insert_user_book(object: $object) { error id }
}`;
const UPDATE_BOOK = `mutation UpdateBook($id: Int!, $object: UserBookUpdateInput!) {
  update_user_book(id: $id, object: $object) { error id }
}`;
const ADD_READ = `mutation AddRead($userBookId: Int!, $read: DatesReadInput!) {
  insert_user_book_read(user_book_id: $userBookId, user_book_read: $read) { error id }
}`;
const UPDATE_READ = `mutation UpdateRead($id: Int!, $object: DatesReadInput!) {
  update_user_book_read(id: $id, object: $object) { error id }
}`;
const REMOVE_BOOK = `mutation RemoveBook($id: Int!) {
  delete_user_book(id: $id) { id }
}`;

const mutationResult = Schema.Record(
  Schema.String,
  Schema.NullOr(
    Schema.Struct({ error: optionalNullable(Schema.String), id: optionalNullable(Schema.Number) }),
  ),
);

/** One mutation. Fails when Hardcover reports an `error` or returns no row id. */
function mutate(
  deps: HardcoverDeps,
  document: string,
  variables: Record<string, unknown>,
): Effect.Effect<void, ProviderError> {
  return hardcoverRequest<unknown>(deps, document, { variables }).pipe(
    Effect.flatMap((data) =>
      Schema.decodeUnknownEffect(mutationResult)(data).pipe(
        Effect.mapError(
          () => new ProviderDecodeError({ provider, detail: 'invalid mutation response' }),
        ),
      ),
    ),
    Effect.flatMap((data) => {
      const result = Object.values(data)[0];
      if (result?.error != null || result?.id == null) {
        return Effect.fail(
          new ProviderNetworkError({
            provider,
            retryable: false,
            cause: new Error(result?.error ?? 'Hardcover did not save the change'),
          }),
        );
      }
      return Effect.void;
    }),
  );
}

function bookIdOf(item: NormalizedMediaItem): Effect.Effect<number, ProviderError> {
  const bookId = item.externalIds.hardcover;
  return bookId == null
    ? Effect.fail(
        new ProviderDecodeError({ provider, detail: `"${item.title}" has no Hardcover id` }),
      )
    : Effect.succeed(bookId);
}

export interface HardcoverLogOptions {
  /** The whole book, or the page reached. Page 0 only starts the read. */
  reading: { finished: true } | { finished: false; page: number };
  /** The reader's calendar day for the log, `YYYY-MM-DD` in their time zone. */
  date: string;
  /** The chosen instant, when the log is backdated. It dates the journal entry. */
  at?: string;
  /** The book is already Read and this log is another read of it. */
  reread?: boolean;
}

/**
 * Logs reading on a book. It reads the library entry first and picks the
 * write from what is there, so a book that is not in the library gets
 * `insert_user_book` and a retry after a half-finished log continues from the
 * step that landed.
 *
 * - Finished: status Read on `date`. On a book that is already Read, a
 *   reread adds a finished read and anything else is a skip, so a repeated
 *   request never records a second read.
 * - Page reached: status Currently Reading when the book has no read in
 *   progress (on a Read book this opens a reread), then the page on that read.
 */
export function logToHardcover(
  deps: HardcoverDeps,
  item: NormalizedMediaItem,
  options: HardcoverLogOptions,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  return Effect.gen(function* () {
    const bookId = yield* bookIdOf(item);
    const entry = yield* getBookEntry(deps, bookId);
    const journalDate = options.at != null ? { action_at: options.at } : {};
    const statusChange = (statusId: number) => ({
      status_id: statusId,
      user_date: options.date,
      ...journalDate,
    });
    const setStatus = (statusId: number) =>
      entry == null
        ? mutate(deps, ADD_BOOK, { object: { book_id: bookId, ...statusChange(statusId) } })
        : mutate(deps, UPDATE_BOOK, { id: entry.id, object: statusChange(statusId) });

    if (options.reading.finished) {
      if (entry?.statusId !== HardcoverStatus.Read) {
        yield* setStatus(HardcoverStatus.Read);
        return { status: 'ok' };
      }
      if (options.reread !== true) {
        return { status: 'skipped', reason: 'already marked as read on Hardcover' };
      }
      yield* mutate(deps, ADD_READ, {
        userBookId: entry.id,
        read: { finished_at: options.date, ...journalDate },
      });
      return { status: 'ok' };
    }

    let read = entry?.openRead ?? null;
    if (read == null) yield* setStatus(HardcoverStatus.Reading);
    const { page } = options.reading;
    if (page <= 0) return { status: 'ok' };
    // The status change opened the read. Its id comes from a new read of the entry.
    read ??= (yield* getBookEntry(deps, bookId))?.openRead ?? null;
    if (read == null) {
      return yield* new ProviderDecodeError({
        provider,
        detail: `Hardcover has no read in progress for "${item.title}"`,
      });
    }
    yield* mutate(deps, UPDATE_READ, {
      id: read.id,
      object: { progress_pages: page, ...journalDate },
    });
    return { status: 'ok' };
  });
}

const STATUS_NAMES: Record<number, string> = {
  [HardcoverStatus.Reading]: 'Currently Reading',
  [HardcoverStatus.Read]: 'Read',
  [HardcoverStatus.Paused]: 'Paused',
  [HardcoverStatus.DidNotFinish]: 'Did Not Finish',
  [HardcoverStatus.Ignored]: 'Ignored',
};

/**
 * Want to Read, the reading-list add. It writes only when the book is not in
 * the library: an entry holds one status, so writing Want to Read over
 * Reading or Read would move the book back. A failed entry read fails the
 * effect and no mutation is sent.
 */
export function addToHardcoverReadingList(
  deps: HardcoverDeps,
  item: NormalizedMediaItem,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  return Effect.gen(function* () {
    const bookId = yield* bookIdOf(item);
    const entry = yield* getBookEntry(deps, bookId);
    if (entry == null) {
      yield* mutate(deps, ADD_BOOK, {
        object: { book_id: bookId, status_id: HardcoverStatus.WantToRead },
      });
      return { status: 'ok' };
    }
    return {
      status: 'skipped',
      reason:
        entry.statusId === HardcoverStatus.WantToRead
          ? 'already on your Hardcover Want to Read list'
          : `Hardcover already tracks this as ${STATUS_NAMES[entry.statusId] ?? 'another status'}`,
    };
  });
}

/**
 * The reading-list removal. Deleting a library entry also deletes its reads,
 * rating, review and notes, so this deletes only an entry that a new read of
 * the library shows as Want to Read with nothing else on it. A failed entry
 * read fails the effect and no mutation is sent.
 */
export function removeFromHardcoverReadingList(
  deps: HardcoverDeps,
  item: NormalizedMediaItem,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  return Effect.gen(function* () {
    const bookId = yield* bookIdOf(item);
    const entry = yield* getBookEntry(deps, bookId);
    if (entry == null) {
      return { status: 'skipped', reason: "wasn't in your Hardcover library" };
    }
    if (entry.statusId !== HardcoverStatus.WantToRead) {
      return {
        status: 'skipped',
        reason: `Hardcover tracks this as ${STATUS_NAMES[entry.statusId] ?? 'another status'}`,
      };
    }
    if (!entry.bare) {
      return {
        status: 'skipped',
        reason: 'removing would delete your Hardcover reads, rating, review or notes',
      };
    }
    yield* mutate(deps, REMOVE_BOOK, { id: entry.id });
    return { status: 'ok' };
  });
}
