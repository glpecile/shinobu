import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  ProviderDecodeError,
  ProviderNetworkError,
  type ProviderError,
} from '@/lib/providers/errors';
import { optionalNullable } from '@/lib/providers/schema';
import { Provider } from '@/lib/providers/types';
import type {
  NormalizedCharacter,
  NormalizedCrewMember,
  NormalizedMediaItem,
} from '@/types/media';
import type { HardcoverDeps } from './deps';
import { hardcoverRequest } from './http';
import { hardcoverBookFields, normalizeHardcoverBook, numeric } from './normalize';

const provider = Provider.Hardcover;

function decode<S extends Schema.Constraint>(schema: S, detail: string) {
  return (data: unknown) =>
    Schema.decodeUnknownEffect(schema)(data).pipe(
      Effect.mapError((error) => new ProviderDecodeError({ provider, detail: `${detail}: ${error.message}` })),
    );
}

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

/** `results` is Typesense's raw response; each hit's `document` is one book. */
const searchData = Schema.Struct({
  search: optionalNullable(Schema.Struct({
    error: optionalNullable(Schema.String),
    results: optionalNullable(Schema.Struct({
      hits: optionalNullable(Schema.Array(Schema.Struct({
        document: Schema.Struct({
          ...hardcoverBookFields,
          id: optionalNullable(hardcoverBookFields.id),
          author_names: optionalNullable(Schema.Array(Schema.String)),
        }),
      }))),
    })),
  })),
});

/** A search result row: the book, and its author names for the row's byline. */
export interface HardcoverBookHit {
  item: NormalizedMediaItem;
  authors: readonly string[];
}

/**
 * Books by title, in Hardcover's own ranking. One top-level field. Each hit
 * stays its own book: an adaptation with the same title is a different book
 * with different authors.
 */
export const searchBooks = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  params: { query: string; perPage: number },
): Effect.fn.Return<HardcoverBookHit[], ProviderError> {
  const data = yield* hardcoverRequest<unknown>(
    deps,
    `query SearchBooks($query: String!, $perPage: Int!) {
      search(query: $query, query_type: "book", per_page: $perPage, page: 1) { error results }
    }`,
    { variables: { query: params.query, perPage: params.perPage } },
  ).pipe(Effect.flatMap(decode(searchData, 'invalid search response')));
  // `SearchOutput` reports its own failure in `error`, beside a 200.
  const error = data.search?.error;
  if (error != null && error !== '') {
    return yield* new ProviderNetworkError({ provider, retryable: false, cause: new Error(error) });
  }
  const nowIso = new Date(yield* Clock.currentTimeMillis).toISOString();
  return (data.search?.results?.hits ?? []).flatMap(({ document: { id, ...document } }) =>
    id == null
      ? []
      : [{ item: normalizeHardcoverBook({ ...document, id }, nowIso), authors: document.author_names ?? [] }],
  );
});

const bookData = Schema.Struct({
  books_by_pk: optionalNullable(Schema.Struct({
    ...hardcoverBookFields,
    contributions: optionalNullable(Schema.Array(Schema.Struct({
      contribution: optionalNullable(Schema.String),
      author: optionalNullable(Schema.Struct({
        id: Schema.Number,
        name: Schema.String,
        image: hardcoverBookFields.image,
      })),
    }))),
    featured_book_series: optionalNullable(Schema.Struct({
      position: optionalNullable(numeric),
      series: optionalNullable(Schema.Struct({ name: Schema.String })),
    })),
    book_characters: optionalNullable(Schema.Array(Schema.Struct({
      only_mentioned: optionalNullable(Schema.Boolean),
      character: optionalNullable(Schema.Struct({
        id: numeric,
        name: Schema.String,
      })),
    }))),
  })),
});

export interface HardcoverBookSeries {
  name: string;
  /** Can be fractional, e.g. 1.5 for a novella between books 1 and 2. */
  position?: number;
}

export interface HardcoverBookDetails {
  item: NormalizedMediaItem;
  /** One per person, roles merged: "Author", "Translator", "Author, Illustrator". */
  authors: NormalizedCrewMember[];
  characters: NormalizedCharacter[];
  series?: HardcoverBookSeries;
}

/**
 * One book by id, for the details screen. One top-level field; the nested
 * credits, series and characters are free. Characters flagged as spoilers
 * are left out.
 */
export const getBook = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  bookId: number,
): Effect.fn.Return<HardcoverBookDetails, ProviderError> {
  const data = yield* hardcoverRequest<unknown>(
    deps,
    `query Book($id: Int!) {
      books_by_pk(id: $id) {
        id title description pages release_year rating ratings_count
        image { url }
        contributions { contribution author { id name image { url } } }
        featured_book_series { position series { name } }
        book_characters(where: { spoiler: { _eq: false } }, order_by: { position: asc }) {
          only_mentioned
          character { id name }
        }
      }
    }`,
    { variables: { id: bookId } },
  ).pipe(Effect.flatMap(decode(bookData, 'invalid book response')));
  const book = data.books_by_pk;
  if (book == null) {
    return yield* new ProviderNetworkError({
      provider,
      status: 404,
      retryable: false,
      cause: new Error(`Hardcover has no book ${bookId}`),
    });
  }

  const authors = new Map<number, NormalizedCrewMember>();
  for (const { author, contribution } of book.contributions ?? []) {
    if (author == null) continue;
    // An empty role is the book's author. A person can be listed twice in one role.
    const job = contribution || 'Author';
    const existing = authors.get(author.id);
    if (existing == null) {
      authors.set(author.id, { id: `hardcover-person-${author.id}`, name: author.name, job, headshot: author.image?.url ?? '' });
    } else if (!existing.job.split(', ').includes(job)) {
      authors.set(author.id, { ...existing, job: `${existing.job}, ${job}` });
    }
  }
  const series = book.featured_book_series;
  const nowIso = new Date(yield* Clock.currentTimeMillis).toISOString();
  return {
    item: normalizeHardcoverBook(book, nowIso),
    authors: [...authors.values()],
    characters: (book.book_characters ?? []).flatMap(({ character, only_mentioned }) =>
      character == null
        ? []
        : [{
            id: `hardcover-character-${character.id}`,
            name: character.name,
            role: only_mentioned === true ? 'Mentioned' : '',
            image: '',
          }],
    ),
    ...(series?.series != null
      ? { series: { name: series.series.name, ...(series.position != null ? { position: series.position } : {}) } }
      : {}),
  };
});

const slugData = Schema.Struct({
  books: Schema.Array(Schema.Struct({ id: Schema.Number })),
});

/**
 * The book id behind a `hardcover.app/books/{slug}` link, or null when no
 * book has that slug. Slugs are unique, so the equality filter finds one.
 */
export function getBookIdBySlug(
  deps: HardcoverDeps,
  slug: string,
): Effect.Effect<number | null, ProviderError> {
  return hardcoverRequest<unknown>(
    deps,
    'query BookBySlug($slug: String!) { books(where: { slug: { _eq: $slug } }, limit: 1) { id } }',
    { variables: { slug } },
  ).pipe(
    Effect.flatMap(decode(slugData, 'invalid book slug response')),
    Effect.map((data) => data.books[0]?.id ?? null),
  );
}
