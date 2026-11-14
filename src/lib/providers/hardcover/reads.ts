import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  ProviderDecodeError,
  ProviderNetworkError,
  type ProviderError,
} from '@/lib/providers/errors';
import { optionalNullable } from '@/lib/providers/schema';
import type { NormalizedPersonDetails } from '@/lib/providers/tmdb/normalize';
import { Provider } from '@/lib/providers/types';
import type {
  NormalizedCharacter,
  NormalizedCrewMember,
  NormalizedDiaryEntry,
  NormalizedMediaItem,
  PersonCreditRow,
} from '@/types/media';
import type { HardcoverDeps } from './deps';
import { hardcoverRequest } from './http';
import {
  HARDCOVER_READING_EVENTS,
  HardcoverBook,
  hardcoverBookFields,
  HardcoverJournalRow,
  HardcoverLibraryRow,
  normalizeHardcoverBook,
  normalizeHardcoverJournal,
  normalizeHardcoverLibraryRow,
  numeric,
  type HardcoverLibraryEntry,
} from './normalize';

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

const libraryData = Schema.Struct({
  me: Schema.Array(Schema.Struct({ user_books: Schema.Array(HardcoverLibraryRow) })),
});

// One top-level field (KTD-9). Nested reads are only the one in progress, so
// a large finished library adds no `user_book_reads` rows.
const LIBRARY = `query Library($statuses: [Int!]!) {
  me {
    user_books(where: { status_id: { _in: $statuses } }) {
      status_id
      created_at
      updated_at
      edition { pages }
      book { id title description pages release_year rating ratings_count image { url } }
      user_book_reads(where: { finished_at: { _is_null: true } }, order_by: { id: desc }, limit: 1) {
        progress_pages
        progress_seconds
        edition { pages }
      }
    }
  }
}`;

/**
 * The viewer's Want to Read and Currently Reading books, with progress.
 * Continue Reading, the reading list and the details screen read slices of
 * it. Read books are left out: no surface lists them, and a long-time
 * reader's finished shelf would ride along on every refresh.
 */
export function getLibrary(deps: HardcoverDeps): Effect.Effect<HardcoverLibraryEntry[], ProviderError> {
  return hardcoverRequest<unknown>(deps, LIBRARY, {
    variables: {
      statuses: [HardcoverStatus.WantToRead, HardcoverStatus.Reading],
    },
  }).pipe(
    Effect.flatMap(decode(libraryData, 'invalid library response')),
    Effect.map((data) => (data.me[0]?.user_books ?? []).flatMap((row) => normalizeHardcoverLibraryRow(row) ?? [])),
  );
}

const journalData = Schema.Struct({ reading_journals: Schema.Array(HardcoverJournalRow) });

/**
 * One page of the viewer's reading journal, newest first: starts, progress
 * and finishes. One top-level field. `reading_journals` hangs off no `me`
 * relationship, so it filters on the viewer's id. Rows sort on
 * `journal_date` first, the day each entry is dated by, so the diary's
 * watermark reads the pages in the order it places their entries.
 */
export function getReadingJournal(
  deps: HardcoverDeps,
  params: { userId: number; page: number; perPage: number },
): Effect.Effect<{ entries: NormalizedDiaryEntry[]; hasNextPage: boolean }, ProviderError> {
  return hardcoverRequest<unknown>(
    deps,
    `query ReadingJournal($userId: Int!, $events: [String!]!, $limit: Int!, $offset: Int!) {
      reading_journals(
        where: { user_id: { _eq: $userId }, event: { _in: $events } }
        order_by: [{ journal_date: desc_nulls_last }, { action_at: desc }, { id: desc }]
        limit: $limit
        offset: $offset
      ) {
        id event action_at journal_date
        book { id title description pages release_year rating ratings_count image { url } }
      }
    }`,
    {
      variables: {
        userId: params.userId,
        events: HARDCOVER_READING_EVENTS,
        limit: params.perPage,
        offset: (params.page - 1) * params.perPage,
      },
    },
  ).pipe(
    Effect.flatMap(decode(journalData, 'invalid reading journal response')),
    Effect.map(({ reading_journals: rows }) => ({
      entries: rows.flatMap((row) => normalizeHardcoverJournal(row) ?? []),
      // Counted on the rows, so an entry the normalizer drops never ends the diary early.
      hasNextPage: rows.length === params.perPage,
    })),
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
    cached_similar_book_ids: optionalNullable(Schema.Array(numeric)),
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
  /** Hardcover's "Similar books", most similar first. Empty until hardcover.app builds the list. */
  similarBookIds: readonly number[];
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
        cached_similar_book_ids
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
      authors.set(author.id, {
        id: `hardcover-person-${author.id}`,
        name: author.name,
        job,
        headshot: author.image?.url ?? '',
        hardcoverId: author.id,
      });
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
    similarBookIds: book.cached_similar_book_ids ?? [],
  };
});

const booksData = Schema.Struct({ books: Schema.Array(HardcoverBook) });

/** Canonical books by id (status 1, as on an author page), in the order of `ids`. Any other id is skipped. One top-level field. */
export const getBooks = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  ids: readonly number[],
): Effect.fn.Return<NormalizedMediaItem[], ProviderError> {
  const data = yield* hardcoverRequest<unknown>(
    deps,
    `query Books($ids: [Int!]!) {
      books(where: { id: { _in: $ids }, book_status_id: { _eq: 1 } }) {
        id title description pages release_year rating ratings_count image { url }
      }
    }`,
    { variables: { ids } },
  ).pipe(Effect.flatMap(decode(booksData, 'invalid books response')));
  const nowIso = new Date(yield* Clock.currentTimeMillis).toISOString();
  const byId = new Map(data.books.map((book) => [book.id, book]));
  return ids.flatMap((id) => {
    const book = byId.get(id);
    return book == null ? [] : [normalizeHardcoverBook(book, nowIso)];
  });
});

const authorData = Schema.Struct({
  authors: Schema.Array(Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    slug: optionalNullable(Schema.String),
    bio: optionalNullable(Schema.String),
    born_date: optionalNullable(Schema.String),
    death_date: optionalNullable(Schema.String),
    location: optionalNullable(Schema.String),
    image: hardcoverBookFields.image,
  })),
  books: Schema.Array(Schema.Struct({
    ...hardcoverBookFields,
    contributions: Schema.Array(Schema.Struct({ contribution: optionalNullable(Schema.String) })),
  })),
});

/** Enough for a long bibliography; a prolific author's tail is on hardcover.app. */
const AUTHOR_BOOKS_LIMIT = 100;

/** An author by id, or by the slug in a `hardcover.app/authors/{slug}` link. */
export type HardcoverAuthorKey = { id: number } | { slug: string };

/**
 * One author and their books, for `/person/hardcover/<id>`. Two top-level
 * fields. Books are most read first, one row per role ("Author",
 * "Narrator"), with the author's own row leading.
 */
export const getAuthor = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  key: HardcoverAuthorKey,
): Effect.fn.Return<NormalizedPersonDetails, ProviderError> {
  const data = yield* hardcoverRequest<unknown>(
    deps,
    `query Author($author: authors_bool_exp!, $limit: Int!) {
      authors(where: $author, limit: 1) { id name slug bio born_date death_date location image { url } }
      books(
        where: { book_status_id: { _eq: 1 }, contributions: { author: $author } }
        order_by: [{ users_count: desc }, { id: asc }]
        limit: $limit
      ) {
        id title description pages release_year rating ratings_count image { url }
        contributions(where: { author: $author }) { contribution }
      }
    }`,
    {
      variables: {
        // Slugs are unique, so either filter matches one author.
        author: 'id' in key ? { id: { _eq: key.id } } : { slug: { _eq: key.slug } },
        limit: AUTHOR_BOOKS_LIMIT,
      },
    },
  ).pipe(Effect.flatMap(decode(authorData, 'invalid author response')));
  const author = data.authors[0];
  if (author == null) {
    return yield* new ProviderNetworkError({
      provider,
      status: 404,
      retryable: false,
      cause: new Error(`Hardcover has no author ${'id' in key ? key.id : key.slug}`),
    });
  }

  const nowIso = new Date(yield* Clock.currentTimeMillis).toISOString();
  const rows = new Map<string, PersonCreditRow>([['Author', { role: 'Author', items: [], details: {}, roles: {} }]]);
  for (const { contributions, ...book } of data.books) {
    const item = normalizeHardcoverBook(book, nowIso);
    // An empty role is the book's author, as on the book page.
    for (const role of new Set(contributions.map(({ contribution }) => contribution || 'Author'))) {
      const row = rows.get(role) ?? { role, items: [], details: {}, roles: {} };
      row.items.push(item);
      rows.set(role, row);
    }
  }
  const image = author.image?.url ?? '';
  const bio = author.bio?.trim() ?? '';
  return {
    person: {
      hardcoverId: author.id,
      ...(author.slug != null ? { hardcoverSlug: author.slug } : {}),
      name: author.name,
      headshot: image,
      headshotFull: image,
      ...(bio !== '' ? { biography: bio } : {}),
      ...(author.born_date != null ? { birthday: author.born_date } : {}),
      ...(author.death_date != null ? { deathday: author.death_date } : {}),
      ...(author.location != null && author.location !== '' ? { birthplace: author.location } : {}),
    },
    rows: [...rows.values()].filter((row) => row.items.length > 0),
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
