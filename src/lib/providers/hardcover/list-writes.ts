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
import { MAX_NEW_HARDCOVER_LIST_BOOKS } from './config';
import type { HardcoverDeps } from './deps';
import { hardcoverRequest } from './http';
import {
  HARDCOVER_LIST_FIELDS,
  HardcoverListRow,
  normalizeHardcoverList,
  type HardcoverList,
} from './lists';

const provider = Provider.Hardcover;

/**
 * Every write here lands on a member's real Hardcover account.
 *
 * Each top-level field costs one request against the token's budget, and a
 * request with more fields than the burst of 10 is refused. So each document
 * has one top-level field and the requests run one after another.
 */
const CREATE_LIST = `mutation CreateList($object: ListInput!) {
  insert_list(object: $object) { errors id }
}`;
const UPDATE_LIST = `mutation UpdateList($id: Int!, $object: ListInput!) {
  update_list(id: $id, object: $object) { errors id }
}`;
const DELETE_LIST = `mutation DeleteList($id: Int!) {
  delete_list(id: $id) { success }
}`;
const ADD_LIST_BOOK = `mutation AddListBook($object: ListBookInput!) {
  insert_list_book(object: $object) { id }
}`;
const REMOVE_LIST_BOOK = `mutation RemoveListBook($id: Int!) {
  delete_list_book(id: $id) { id }
}`;

const LIST_INPUT = `query ListInput($id: Int!) {
  lists(where: { id: { _eq: $id } }, limit: 1) {
    name description privacy_setting_id ranked default_view featured_profile url
  }
}`;
const LIST_ENTRY = `query ListEntry($listId: Int!, $bookId: Int!) {
  list_books(where: { list_id: { _eq: $listId }, book_id: { _eq: $bookId } }, limit: 1) { id }
}`;
const BOOK_MEMBERSHIP = `query BookMembership($bookId: Int!) {
  me {
    lists(order_by: { updated_at: desc }) {
      ${HARDCOVER_LIST_FIELDS}
      membership: list_books(where: { book_id: { _eq: $bookId } }, limit: 1) { id }
    }
  }
}`;

function decode<S extends Schema.Constraint>(schema: S, detail: string) {
  return (data: unknown) =>
    Schema.decodeUnknownEffect(schema)(data).pipe(
      Effect.mapError((error) => new ProviderDecodeError({ provider, detail: `${detail}: ${error.message}` })),
    );
}

function refused(message = 'Hardcover did not save the change') {
  return new ProviderNetworkError({ provider, retryable: false, cause: new Error(message) });
}

const mutationResult = Schema.Record(
  Schema.String,
  Schema.NullOr(
    Schema.Struct({
      errors: optionalNullable(Schema.Array(Schema.String)),
      id: optionalNullable(Schema.Number),
      success: optionalNullable(Schema.Boolean),
    }),
  ),
);

/** One mutation. Fails when Hardcover reports `errors`. */
const mutate = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  document: string,
  variables: Record<string, unknown>,
): Effect.fn.Return<{ id?: number; success?: boolean }, ProviderError> {
  const data = yield* hardcoverRequest<unknown>(deps, document, { variables }).pipe(
    Effect.flatMap(decode(mutationResult, 'invalid mutation response')),
  );
  const result = Object.values(data)[0];
  if (result?.errors != null && result.errors.length > 0) {
    return yield* refused(result.errors.join('; '));
  }
  return result ?? {};
});

/** One mutation that answers the row it wrote. Fails without a row id. */
const mutateRow = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  document: string,
  variables: Record<string, unknown>,
): Effect.fn.Return<number, ProviderError> {
  const { id } = yield* mutate(deps, document, variables);
  if (id == null) return yield* refused();
  return id;
});

function bookIdOf(item: NormalizedMediaItem): Effect.Effect<number, ProviderError> {
  const bookId = item.externalIds.hardcover;
  return bookId == null
    ? Effect.fail(
        new ProviderDecodeError({ provider, detail: `"${item.title}" has no Hardcover id` }),
      )
    : Effect.succeed(bookId);
}

export interface HardcoverListDraft {
  name: string;
  description: string;
  /** Hardcover's `privacy_setting_id`: 1 public, 2 followers, 3 private. */
  privacy: 1 | 2 | 3;
  ranked: boolean;
  /** Books, each with `externalIds.hardcover`. */
  items: NormalizedMediaItem[];
}

/**
 * `insert_list`, then one `insert_list_book` per item, in order, one request
 * each. A list that was created never fails the effect: a book that fails is
 * reported in `failed` by its title, because a retry of the whole create
 * would make a second list.
 *
 * Fails when `insert_list` reports `errors` or returns no id. Fails before
 * any request when an item has no Hardcover id or there are more than
 * `MAX_NEW_HARDCOVER_LIST_BOOKS`.
 */
export const createHardcoverList = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  draft: HardcoverListDraft,
): Effect.fn.Return<{ id: string; failed: string[] }, ProviderError> {
  if (draft.items.length > MAX_NEW_HARDCOVER_LIST_BOOKS) {
    return yield* new ProviderDecodeError({
      provider,
      detail: `a new list takes at most ${MAX_NEW_HARDCOVER_LIST_BOOKS} books`,
    });
  }
  const bookIds = yield* Effect.forEach(draft.items, bookIdOf);
  const listId = yield* mutateRow(deps, CREATE_LIST, {
    object: {
      name: draft.name,
      description: draft.description,
      privacy_setting_id: draft.privacy,
      ranked: draft.ranked,
    },
  });
  const failed: string[] = [];
  for (const [index, item] of draft.items.entries()) {
    yield* mutateRow(deps, ADD_LIST_BOOK, {
      object: { list_id: listId, book_id: bookIds[index] },
    }).pipe(Effect.catch(() => Effect.sync(() => failed.push(item.title))));
  }
  return { id: String(listId), failed };
});

const listInputData = Schema.Struct({
  lists: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: optionalNullable(Schema.String),
      privacy_setting_id: optionalNullable(Schema.Number),
      ranked: optionalNullable(Schema.Boolean),
      default_view: optionalNullable(Schema.String),
      featured_profile: optionalNullable(Schema.Boolean),
      url: optionalNullable(Schema.String),
    }),
  ),
});

/**
 * Rename and description edit. Whether `update_list` replaces the row or
 * only the given fields is not known, so this reads the list's current
 * fields and sends all of them with the change applied.
 */
export const updateHardcoverList = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  params: { id: number; name: string; description?: string },
): Effect.fn.Return<{ name: string }, ProviderError> {
  const data = yield* hardcoverRequest<unknown>(deps, LIST_INPUT, {
    variables: { id: params.id },
  }).pipe(Effect.flatMap(decode(listInputData, 'invalid list response')));
  const current = data.lists[0];
  if (current == null) {
    return yield* new ProviderNetworkError({
      provider,
      status: 404,
      retryable: false,
      cause: new Error(`Hardcover has no list ${params.id}`),
    });
  }
  const { name, description } = params;
  yield* mutateRow(deps, UPDATE_LIST, {
    id: params.id,
    object: { ...current, name, ...(description != null ? { description } : {}) },
  });
  return { name };
});

/** `delete_list`. Fails unless `success` is true. */
export const deleteHardcoverList = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  id: number,
): Effect.fn.Return<void, ProviderError> {
  const { success } = yield* mutate(deps, DELETE_LIST, { id });
  if (success !== true) return yield* refused('Hardcover did not delete the list');
});

const listEntryData = Schema.Struct({
  list_books: Schema.Array(Schema.Struct({ id: Schema.Number })),
});

/**
 * Adds a book to a list. Whether `insert_list_book` refuses a duplicate is
 * not known, so this reads membership first: a book already in the list
 * answers its row id and sends no mutation.
 */
export const addBookToHardcoverList = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  params: { listId: number; item: NormalizedMediaItem },
): Effect.fn.Return<{ entryId: string }, ProviderError> {
  const bookId = yield* bookIdOf(params.item);
  const data = yield* hardcoverRequest<unknown>(deps, LIST_ENTRY, {
    variables: { listId: params.listId, bookId },
  }).pipe(Effect.flatMap(decode(listEntryData, 'invalid list entry response')));
  const existing = data.list_books[0];
  const entryId =
    existing?.id ??
    (yield* mutateRow(deps, ADD_LIST_BOOK, { object: { list_id: params.listId, book_id: bookId } }));
  return { entryId: String(entryId) };
});

/** `delete_list_book` by the `list_books` row id. */
export function removeBookFromHardcoverList(
  deps: HardcoverDeps,
  entryId: number,
): Effect.Effect<void, ProviderError> {
  return Effect.asVoid(mutateRow(deps, REMOVE_LIST_BOOK, { id: entryId }));
}

export interface HardcoverBookMembership extends HardcoverList {
  /** The `list_books` row that holds the book, null when the list does not. */
  entryId: string | null;
}

const membershipData = Schema.Struct({
  me: Schema.Array(
    Schema.Struct({
      lists: Schema.Array(
        Schema.Struct({
          ...HardcoverListRow.fields,
          membership: Schema.Array(Schema.Struct({ id: Schema.Number })),
        }),
      ),
    }),
  ),
});

/**
 * The viewer's own lists, each with the row id that holds `bookId`, or null.
 * The read behind the add and remove toggle. One top-level field.
 */
export const getHardcoverListMembership = Effect.fnUntraced(function* (
  deps: HardcoverDeps,
  bookId: number,
): Effect.fn.Return<HardcoverBookMembership[], ProviderError> {
  const data = yield* hardcoverRequest<unknown>(deps, BOOK_MEMBERSHIP, {
    variables: { bookId },
  }).pipe(Effect.flatMap(decode(membershipData, 'invalid list membership response')));
  const nowIso = new Date(yield* Clock.currentTimeMillis).toISOString();
  return (data.me[0]?.lists ?? []).map((row) => {
    const entry = row.membership[0];
    return { ...normalizeHardcoverList(row, nowIso), entryId: entry == null ? null : String(entry.id) };
  });
});
