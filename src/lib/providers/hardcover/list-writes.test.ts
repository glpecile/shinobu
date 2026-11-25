import { describe, expect, mock, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import type { NormalizedMediaItem } from '@/types/media';
import type { HardcoverDeps } from './deps';

// The transport reaches the PKCE flow store, which is MMKV.
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({ getString: () => undefined, set: () => {}, remove: () => {} }),
}));

const {
  addBookToHardcoverList,
  createHardcoverList,
  deleteHardcoverList,
  getHardcoverListMembership,
  removeBookFromHardcoverList,
  updateHardcoverList,
} = await import('./list-writes');

const book = (id: number, title: string): NormalizedMediaItem => ({
  id: `hardcover-${id}`,
  title,
  coverImage: '',
  type: 'BOOK',
  currentProgress: 0,
  progressUnit: 'page',
  lastUpdated: '',
  externalIds: { hardcover: id },
});
const BOOK = book(427578, 'No Longer Human');

interface Mutation {
  name: string;
  variables: Record<string, unknown>;
}

function hardcover(
  options: {
    reads?: Record<string, unknown>;
    answer?: (mutation: Mutation) => unknown;
  } = {},
) {
  const mutations: Mutation[] = [];
  const deps: HardcoverDeps = {
    clientId: 'cid',
    refreshLock: (run) => run(),
    tokens: { get: () => ({ accessToken: 'at' }), set: () => {}, clear: () => {} },
    fetch: async (_input, init) => {
      const { query, variables } = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      };
      const read = /^query (\w+)/.exec(query)?.[1];
      if (read != null) return Response.json({ data: options.reads?.[read] });
      const mutation = { name: /^mutation \w+[^{]*\{\s*(\w+)/.exec(query)?.[1] ?? '', variables };
      mutations.push(mutation);
      return Response.json({ data: { [mutation.name]: options.answer?.(mutation) ?? { id: 900 } } });
    },
  };
  return { deps, mutations };
}

const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(Effect.result(effect));

const DRAFT = { name: 'Dazai', description: '', privacy: 3, ranked: false } as const;

describe('createHardcoverList', () => {
  test('the list is created first, then the books in order, and a refused book is reported', async () => {
    const { deps, mutations } = hardcover({
      answer: ({ variables }) =>
        (variables.object as { book_id?: number }).book_id === 2 ? { id: null } : undefined,
    });

    const result = await run(
      createHardcoverList(deps, { ...DRAFT, items: [book(1, 'One'), book(2, 'Two'), book(3, 'Three')] }),
    );

    expect(result).toMatchObject({ success: { id: '900', failed: ['Two'] } });
    expect(mutations).toEqual([
      {
        name: 'insert_list',
        variables: { object: { name: 'Dazai', description: '', privacy_setting_id: 3, ranked: false } },
      },
      { name: 'insert_list_book', variables: { object: { list_id: 900, book_id: 1 } } },
      { name: 'insert_list_book', variables: { object: { list_id: 900, book_id: 2 } } },
      { name: 'insert_list_book', variables: { object: { list_id: 900, book_id: 3 } } },
    ]);
  });

  test('errors on the list fail the create and add no book', async () => {
    const { deps, mutations } = hardcover({ answer: () => ({ errors: ['Name is taken'], id: null }) });

    const result = await run(createHardcoverList(deps, { ...DRAFT, items: [BOOK] }));

    expect(result).toMatchObject({ _tag: 'Failure', failure: { _tag: 'ProviderNetworkError', retryable: false } });
    expect(mutations).toHaveLength(1);
  });

  test('a book with no Hardcover id, or a ninth book, sends nothing', async () => {
    const { deps, mutations } = hardcover();

    const noId = await run(createHardcoverList(deps, { ...DRAFT, items: [{ ...BOOK, externalIds: {} }] }));
    const tooMany = await run(
      createHardcoverList(deps, { ...DRAFT, items: Array.from({ length: 9 }, (_, i) => book(i + 1, 'Book')) }),
    );

    expect([noId._tag, tooMany._tag]).toEqual(['Failure', 'Failure']);
    expect(mutations).toEqual([]);
  });
});

describe('list edits', () => {
  test('an update sends every current field with the new name and description', async () => {
    const { deps, mutations } = hardcover({
      reads: {
        ListInput: {
          lists: [
            {
              name: 'Old',
              description: null,
              privacy_setting_id: 3,
              ranked: true,
              default_view: 'grid',
              featured_profile: false,
              url: null,
            },
          ],
        },
      },
    });

    const result = await run(updateHardcoverList(deps, { id: 7, name: 'New', description: 'Notes' }));

    expect(result).toMatchObject({ success: { name: 'New' } });
    expect(mutations).toEqual([
      {
        name: 'update_list',
        variables: {
          id: 7,
          object: {
            name: 'New',
            description: 'Notes',
            privacy_setting_id: 3,
            ranked: true,
            default_view: 'grid',
            featured_profile: false,
          },
        },
      },
    ]);
  });

  test('a delete that does not succeed fails', async () => {
    const { deps, mutations } = hardcover({ answer: () => ({ success: false }) });

    const result = await run(deleteHardcoverList(deps, 7));

    expect(result).toMatchObject({ _tag: 'Failure', failure: { _tag: 'ProviderNetworkError', retryable: false } });
    expect(mutations).toEqual([{ name: 'delete_list', variables: { id: 7 } }]);
  });
});

const row = (id: number, membership: { id: number }[]) => ({
  id,
  name: 'Dazai',
  slug: 'dazai',
  description: null,
  books_count: 1,
  likes_count: 0,
  ranked: false,
  privacy_setting_id: 1,
  user_id: 3,
  user: { username: 'gian' },
  previews: [],
  membership,
});

describe('list books', () => {
  test('a book already in the list answers its row and sends no mutation', async () => {
    const { deps, mutations } = hardcover({ reads: { ListEntry: { list_books: [{ id: 55 }] } } });

    const result = await run(addBookToHardcoverList(deps, { listId: 7, item: BOOK }));

    expect(result).toMatchObject({ success: { entryId: '55' } });
    expect(mutations).toEqual([]);
  });

  test('a book that is not in the list is inserted', async () => {
    const { deps, mutations } = hardcover({ reads: { ListEntry: { list_books: [] } } });

    const result = await run(addBookToHardcoverList(deps, { listId: 7, item: BOOK }));

    expect(result).toMatchObject({ success: { entryId: '900' } });
    expect(mutations).toEqual([
      { name: 'insert_list_book', variables: { object: { list_id: 7, book_id: 427578 } } },
    ]);
  });

  test('a removal sends the row id', async () => {
    const { deps, mutations } = hardcover();

    await run(removeBookFromHardcoverList(deps, 55));

    expect(mutations).toEqual([{ name: 'delete_list_book', variables: { id: 55 } }]);
  });

  test('membership carries the row id of a list that holds the book, and null otherwise', async () => {
    const { deps } = hardcover({
      reads: { BookMembership: { me: [{ lists: [row(7, [{ id: 55 }]), row(8, [])] }] } },
    });

    const result = await run(getHardcoverListMembership(deps, 427578));

    expect(result).toMatchObject({
      success: [
        { id: '7', title: 'Dazai', entryId: '55' },
        { id: '8', entryId: null },
      ],
    });
  });
});
