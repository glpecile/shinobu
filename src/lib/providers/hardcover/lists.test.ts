import { describe, expect, mock, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import type { HardcoverDeps } from './deps';

// The auth module behind `hardcoverRequest` keeps its PKCE flow in MMKV.
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({ getString: () => undefined, set: () => {}, remove: () => {} }),
}));

const { getHardcoverBookLists, getHardcoverList, getHardcoverLists } = await import('./lists');

function deps(data: unknown): HardcoverDeps {
  return {
    clientId: 'cid',
    tokens: { get: () => ({ accessToken: 'at' }), set: () => {}, clear: () => {} },
    refreshLock: (run) => run(),
    fetch: async () => new Response(JSON.stringify({ data })),
  };
}

function row(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `List ${id}`,
    slug: `list-${id}`,
    description: null,
    books_count: 2,
    likes_count: 0,
    ranked: false,
    privacy_setting_id: 1,
    user_id: 7,
    user: { username: 'gian' },
    previews: [],
    ...extra,
  };
}

describe('getHardcoverLists', () => {
  test('a created list normalizes, with previews in the order sent', async () => {
    const lists = await Effect.runPromise(
      getHardcoverLists(
        deps({
          me: [
            {
              lists: [
                row(1, {
                  name: 'Horror',
                  previews: [
                    { book: { id: 902, title: 'No Longer Human' } },
                    { book: { id: 61, title: 'Uzumaki' } },
                  ],
                }),
              ],
            },
          ],
        }),
        'created',
      ),
    );

    expect(lists.map(({ previews, ...list }) => [list, previews.map((item) => item.id)])).toEqual([
      [
        {
          id: '1',
          title: 'Horror',
          owner: 'gian',
          ownerId: 7,
          slug: 'list-1',
          description: '',
          bookCount: 2,
          likesCount: 0,
          ranked: false,
          privacy: 1,
        },
        ['hardcover-902', 'hardcover-61'],
      ],
    ]);
  });

  test('liked lists read through followed_lists', async () => {
    const lists = await Effect.runPromise(
      getHardcoverLists(
        deps({
          me: [{ followed_lists: [{ list: row(4) }, { list: row(3) }] }],
        }),
        'liked',
      ),
    );

    expect(lists.map((list) => list.id)).toEqual(['4', '3']);
  });
});

describe('getHardcoverList', () => {
  test('a page maps its entries, the viewer status and ownership', async () => {
    const page = await Effect.runPromise(
      getHardcoverList(
        deps({
          lists: [
            row(1, {
              list_books: [
                {
                  id: 50,
                  position: 1,
                  book: {
                    id: 902,
                    title: 'No Longer Human',
                    contributions: [
                      { contribution: null, author: { name: 'Junji Ito' } },
                      { contribution: '', author: { name: 'Junji Ito' } },
                      { contribution: 'Translator', author: { name: 'Jocelyne Allen' } },
                    ],
                    user_books: [{ status_id: 3 }],
                  },
                },
                {
                  id: 51,
                  position: null,
                  book: { id: 61, title: 'Uzumaki', contributions: [], user_books: [] },
                },
              ],
            }),
          ],
        }),
        { id: 1, viewerId: 7, page: 1 },
      ),
    );

    expect(page.mine).toBe(true);
    expect(page.hasNextPage).toBe(false);
    expect(page.entries.map(({ item, ...entry }) => [item.id, entry])).toEqual([
      ['hardcover-902', { id: '50', position: 1, authors: ['Junji Ito'], statusId: 3 }],
      ['hardcover-61', { id: '51', position: null, authors: [], statusId: null }],
    ]);
  });

  test("a full page of another member's list has a next page", async () => {
    const page = await Effect.runPromise(
      getHardcoverList(
        deps({
          lists: [
            row(1, {
              list_books: Array.from({ length: 100 }, (_, index) => ({
                id: index + 1,
                book: { id: index + 1 },
              })),
            }),
          ],
        }),
        { id: 1, viewerId: 8, page: 1 },
      ),
    );

    expect(page.mine).toBe(false);
    expect(page.hasNextPage).toBe(true);
  });

  test('a list Hardcover does not return fails with 404', async () => {
    const error = await Effect.runPromise(
      Effect.flip(getHardcoverList(deps({ lists: [] }), { id: 1, viewerId: 7, page: 1 })),
    );

    expect(error).toMatchObject({ _tag: 'ProviderNetworkError', status: 404 });
  });
});

describe('getHardcoverBookLists', () => {
  test('a list that holds the book twice shows once', async () => {
    const lists = await Effect.runPromise(
      getHardcoverBookLists(
        deps({
          list_books: [{ list: row(9) }, { list: row(9) }, { list: row(2) }],
        }),
        902,
      ),
    );

    expect(lists.map((list) => list.id)).toEqual(['9', '2']);
  });
});
