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
import type { NormalizedMediaItem } from '@/types/media';
import type { HardcoverDeps } from './deps';
import { hardcoverRequest } from './http';
import { HardcoverBook, hardcoverBookFields, normalizeHardcoverBook } from './normalize';

const provider = Provider.Hardcover;

export type HardcoverListKind = 'created' | 'liked';

export interface HardcoverList {
  id: string;
  title: string;
  owner: string;
  ownerId: number;
  slug: string;
  description: string;
  bookCount: number;
  likesCount: number;
  ranked: boolean;
  /** Hardcover's `privacy_setting_id`: 1 public, 2 followers, 3 private. */
  privacy: number;
  previews: NormalizedMediaItem[];
}

export interface HardcoverListEntry {
  /** The `list_books` id a removal needs. */
  id: string;
  position: number | null;
  item: NormalizedMediaItem;
  authors: string[];
  statusId: number | null;
}

export interface HardcoverListPage {
  list: HardcoverList;
  mine: boolean;
  entries: HardcoverListEntry[];
  hasNextPage: boolean;
}

const BOOK_FIELDS = 'id title description pages release_year rating ratings_count image { url }';

/** `previews` is aliased so callers can select `list_books` again with different arguments. */
export const HARDCOVER_LIST_FIELDS = `id name slug description books_count likes_count ranked privacy_setting_id user_id
  user { username }
  previews: list_books(order_by: [{ position: asc }, { id: asc }], limit: 5) { book { ${BOOK_FIELDS} } }`;

export const HardcoverListRow = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  slug: optionalNullable(Schema.String),
  description: optionalNullable(Schema.String),
  books_count: Schema.Number,
  likes_count: Schema.Number,
  ranked: Schema.Boolean,
  privacy_setting_id: Schema.Number,
  user_id: Schema.Number,
  user: optionalNullable(Schema.Struct({ username: optionalNullable(Schema.String) })),
  previews: Schema.Array(Schema.Struct({ book: HardcoverBook })),
});

export function normalizeHardcoverList(row: typeof HardcoverListRow.Type, nowIso: string): HardcoverList {
  return {
    id: String(row.id),
    title: row.name,
    owner: row.user?.username ?? '',
    ownerId: row.user_id,
    slug: row.slug ?? '',
    description: row.description ?? '',
    bookCount: row.books_count,
    likesCount: row.likes_count,
    ranked: row.ranked,
    privacy: row.privacy_setting_id,
    previews: row.previews.map(({ book }) => normalizeHardcoverBook(book, nowIso)),
  };
}

export function hardcoverListUrl(owner: string, slug: string): string | null {
  if (owner === '' || slug === '') return null;
  return `${hardcoverListsUrl(owner)}/${encodeURIComponent(slug)}`;
}

export function hardcoverListsUrl(owner: string): string {
  return `https://hardcover.app/@${encodeURIComponent(owner)}/lists`;
}

function decode<S extends Schema.Constraint>(schema: S, detail: string) {
  return (data: unknown) =>
    Schema.decodeUnknownEffect(schema)(data).pipe(
      Effect.mapError((error) => new ProviderDecodeError({ provider, detail: `${detail}: ${error.message}` })),
    );
}

const now = Effect.map(Clock.currentTimeMillis, (millis) => new Date(millis).toISOString());

const createdData = Schema.Struct({
  me: Schema.Array(Schema.Struct({ lists: Schema.Array(HardcoverListRow) })),
});

const likedData = Schema.Struct({
  me: Schema.Array(Schema.Struct({
    followed_lists: Schema.Array(Schema.Struct({ list: HardcoverListRow })),
  })),
});

const readRows = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  kind: HardcoverListKind,
): Effect.fn.Return<ReadonlyArray<typeof HardcoverListRow.Type>, ProviderError> {
  switch (kind) {
    case 'created': {
      const data = yield* hardcoverRequest<unknown>(
        deps,
        `query MyLists { me { lists(order_by: { updated_at: desc }) { ${HARDCOVER_LIST_FIELDS} } } }`,
      ).pipe(Effect.flatMap(decode(createdData, 'invalid lists response')));
      return data.me[0]?.lists ?? [];
    }
    case 'liked': {
      const data = yield* hardcoverRequest<unknown>(
        deps,
        `query LikedLists { me { followed_lists(order_by: { created_at: desc }) { list { ${HARDCOVER_LIST_FIELDS} } } } }`,
      ).pipe(Effect.flatMap(decode(likedData, 'invalid liked lists response')));
      return (data.me[0]?.followed_lists ?? []).map(({ list }) => list);
    }
  }
});

export const getHardcoverLists = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  kind: HardcoverListKind,
): Effect.fn.Return<HardcoverList[], ProviderError> {
  const rows = yield* readRows(deps, kind);
  const nowIso = yield* now;
  return rows.map((row) => normalizeHardcoverList(row, nowIso));
});

const LIST_PAGE_SIZE = 100;

const listData = Schema.Struct({
  lists: Schema.Array(Schema.Struct({
    ...HardcoverListRow.fields,
    list_books: Schema.Array(Schema.Struct({
      id: Schema.Number,
      position: optionalNullable(Schema.Number),
      book: Schema.Struct({
        ...hardcoverBookFields,
        contributions: optionalNullable(Schema.Array(Schema.Struct({
          contribution: optionalNullable(Schema.String),
          author: optionalNullable(Schema.Struct({ name: Schema.String })),
        }))),
        user_books: optionalNullable(Schema.Array(Schema.Struct({ status_id: Schema.Number }))),
      }),
    })),
  })),
});

/** `page` is 1-based (100 books/page). Fails with 404 if missing or private. */
export const getHardcoverList = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  params: { id: number; viewerId: number; page: number },
): Effect.fn.Return<HardcoverListPage, ProviderError> {
  const data = yield* hardcoverRequest<unknown>(
    deps,
    `query List($id: Int!, $viewerId: Int!, $limit: Int!, $offset: Int!) {
      lists(where: { id: { _eq: $id } }, limit: 1) {
        ${HARDCOVER_LIST_FIELDS}
        list_books(order_by: [{ position: asc }, { id: asc }], limit: $limit, offset: $offset) {
          id
          position
          book {
            ${BOOK_FIELDS}
            contributions { contribution author { name } }
            user_books(where: { user_id: { _eq: $viewerId } }, limit: 1) { status_id }
          }
        }
      }
    }`,
    {
      variables: {
        id: params.id,
        viewerId: params.viewerId,
        limit: LIST_PAGE_SIZE,
        offset: (params.page - 1) * LIST_PAGE_SIZE,
      },
    },
  ).pipe(Effect.flatMap(decode(listData, 'invalid list response')));
  const row = data.lists[0];
  if (row == null) {
    return yield* new ProviderNetworkError({
      provider,
      status: 404,
      retryable: false,
      cause: new Error(`Hardcover has no list ${params.id}`),
    });
  }
  const nowIso = yield* now;
  return {
    list: normalizeHardcoverList(row, nowIso),
    mine: row.user_id === params.viewerId,
    entries: row.list_books.map(({ id, position, book: { contributions, user_books, ...book } }) => ({
      id: String(id),
      position: position ?? null,
      item: normalizeHardcoverBook(book, nowIso),
      // An empty role is the book's author, as on the book page.
      authors: [...new Set((contributions ?? []).flatMap(({ contribution, author }) =>
        author != null && (contribution || 'Author') === 'Author' ? [author.name] : [],
      ))],
      statusId: user_books?.[0]?.status_id ?? null,
    })),
    hasNextPage: row.list_books.length === LIST_PAGE_SIZE,
  };
});

const bookListsData = Schema.Struct({
  list_books: Schema.Array(Schema.Struct({ list: HardcoverListRow })),
});

export const getHardcoverBookLists = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  bookId: number,
): Effect.fn.Return<HardcoverList[], ProviderError> {
  const data = yield* hardcoverRequest<unknown>(
    deps,
    `query BookLists($bookId: Int!) {
      list_books(
        where: { book_id: { _eq: $bookId }, list: { public: { _eq: true } } }
        order_by: { list: { likes_count: desc } }
        limit: 10
      ) {
        list { ${HARDCOVER_LIST_FIELDS} }
      }
    }`,
    { variables: { bookId } },
  ).pipe(Effect.flatMap(decode(bookListsData, 'invalid book lists response')));
  const nowIso = yield* now;
  // A list can hold the same book twice.
  const lists = new Map(data.list_books.map(({ list }) => [list.id, list]));
  return [...lists.values()].map((list) => normalizeHardcoverList(list, nowIso));
});
