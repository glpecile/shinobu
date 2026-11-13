import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { ProviderDecodeError, type ProviderError } from '@/lib/providers/errors';
import { optionalNullable } from '@/lib/providers/schema';
import { Provider } from '@/lib/providers/types';
import type { HardcoverDeps } from './deps';
import { hardcoverRequest } from './http';

const provider = Provider.Hardcover;

/** `me` answers with a one-row list. `read:me:content` covers these fields. */
const viewerData = Schema.Struct({
  me: Schema.Array(Schema.Struct({ id: Schema.Number, username: Schema.String })),
});

export interface HardcoverViewer {
  id: number;
  username: string;
}

/** The connected member. */
export function getViewer(deps: HardcoverDeps): Effect.Effect<HardcoverViewer, ProviderError> {
  return hardcoverRequest<unknown>(deps, 'query Viewer { me { id username } }').pipe(
    Effect.flatMap((data) =>
      Schema.decodeUnknownEffect(viewerData)(data).pipe(
        Effect.flatMap((decoded) => Effect.fromNullishOr(decoded.me[0])),
        Effect.mapError(() => new ProviderDecodeError({ provider, detail: 'invalid viewer response' })),
      ),
    ),
  );
}

/** Hardcover's `status_id` values for a library entry. */
export const HardcoverStatus = {
  WantToRead: 1,
  Reading: 2,
  Read: 3,
  Paused: 4,
  DidNotFinish: 5,
  Ignored: 6,
} as const;

const pages = Schema.Struct({ pages: optionalNullable(Schema.Number) });

const bookEntryData = Schema.Struct({
  me: Schema.Array(
    Schema.Struct({
      user_books: Schema.Array(
        Schema.Struct({
          id: Schema.Number,
          status_id: Schema.Number,
          rating: optionalNullable(Schema.Unknown),
          has_review: optionalNullable(Schema.Boolean),
          owned: optionalNullable(Schema.Boolean),
          starred: optionalNullable(Schema.Boolean),
          private_notes: optionalNullable(Schema.String),
          edition: optionalNullable(pages),
          book: optionalNullable(pages),
          user_book_reads: Schema.Array(
            Schema.Struct({
              id: Schema.Number,
              finished_at: optionalNullable(Schema.String),
              progress_pages: optionalNullable(Schema.Number),
              edition: optionalNullable(pages),
            }),
          ),
        }),
      ),
    }),
  ),
});

/** The viewer's library entry for one book. */
export interface HardcoverBookEntry {
  /** The `user_books` id that status changes and reads attach to. */
  id: number;
  statusId: number;
  /** The read that is started and not finished. Progress goes on it. */
  openRead: { id: number; progressPages: number } | null;
  /** The day each finished read ended, `YYYY-MM-DD`. */
  finishedOn: string[];
  /** The page count of the edition being read, else the entry's, else the book's. */
  pages: number | null;
  /**
   * True when the entry holds nothing but its status: no read, rating,
   * review, notes, ownership or star. Only such an entry is safe to delete.
   */
  bare: boolean;
}

// One top-level field. Nested under `me`, so it needs no user id.
const BOOK_ENTRY = `query BookEntry($bookId: Int!) {
  me {
    user_books(where: { book_id: { _eq: $bookId } }, limit: 1) {
      id
      status_id
      rating
      has_review
      owned
      starred
      private_notes
      edition { pages }
      book { pages }
      user_book_reads(order_by: { id: desc }) {
        id
        finished_at
        progress_pages
        edition { pages }
      }
    }
  }
}`;

/** The viewer's library entry for `bookId`, or null when the book is not in the library. */
export function getBookEntry(
  deps: HardcoverDeps,
  bookId: number,
): Effect.Effect<HardcoverBookEntry | null, ProviderError> {
  return hardcoverRequest<unknown>(deps, BOOK_ENTRY, { variables: { bookId } }).pipe(
    Effect.flatMap((data) =>
      Schema.decodeUnknownEffect(bookEntryData)(data).pipe(
        Effect.mapError(
          (error) =>
            new ProviderDecodeError({ provider, detail: `invalid library entry: ${error.message}` }),
        ),
      ),
    ),
    Effect.map((data) => {
      const row = data.me[0]?.user_books[0];
      if (row == null) return null;
      const open = row.user_book_reads.find((read) => read.finished_at == null);
      return {
        id: row.id,
        statusId: row.status_id,
        openRead: open == null ? null : { id: open.id, progressPages: open.progress_pages ?? 0 },
        finishedOn: row.user_book_reads.flatMap((read) => read.finished_at ?? []),
        // 0 pages is an unknown count, so the next source answers.
        pages: open?.edition?.pages || row.edition?.pages || row.book?.pages || null,
        bare:
          row.user_book_reads.length === 0 &&
          row.rating == null &&
          row.has_review !== true &&
          row.owned !== true &&
          row.starred !== true &&
          (row.private_notes ?? '').trim() === '',
      };
    }),
  );
}
