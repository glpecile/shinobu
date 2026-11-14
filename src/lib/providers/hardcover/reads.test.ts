import { describe, expect, mock, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import type { HardcoverDeps } from './deps';

// The auth module behind `hardcoverRequest` keeps its PKCE flow in MMKV.
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({ getString: () => undefined, set: () => {}, remove: () => {} }),
}));

const { getAuthor, getBook, searchBooks } = await import('./reads');

function deps(data: unknown): HardcoverDeps {
  return {
    clientId: 'cid',
    tokens: { get: () => ({ accessToken: 'at' }), set: () => {}, clear: () => {} },
    refreshLock: (run) => run(),
    fetch: async () => new Response(JSON.stringify({ data })),
  };
}

describe('searchBooks', () => {
  // KTD-6: an adaptation with the same title is its own book, never merged.
  test('same-title books stay separate, each with its own authors', async () => {
    const hits = await Effect.runPromise(searchBooks(deps({
      search: {
        error: null,
        results: {
          hits: [
            { document: { id: '61', title: 'No Longer Human', author_names: ['Osamu Dazai'], release_year: 1948 } },
            { document: { id: '902', title: 'No Longer Human', author_names: ['Junji Ito', 'Osamu Dazai'], release_year: 2019 } },
          ],
        },
      },
    }), { query: 'No Longer Human', perPage: 20 }));

    expect(hits.map(({ item, authors }) => [item.id, item.year, authors])).toEqual([
      ['hardcover-61', 1948, ['Osamu Dazai']],
      ['hardcover-902', 2019, ['Junji Ito', 'Osamu Dazai']],
    ]);
  });
});

describe('getBook', () => {
  test('each author lists each role once, and a string series position decodes', async () => {
    const book = await Effect.runPromise(getBook(deps({
      books_by_pk: {
        id: 902,
        title: 'No Longer Human',
        contributions: [
          { contribution: null, author: { id: 1, name: 'Junji Ito' } },
          { contribution: '', author: { id: 1, name: 'Junji Ito' } },
          { contribution: 'Illustrator', author: { id: 1, name: 'Junji Ito' } },
          { contribution: 'Translator', author: { id: 2, name: 'Jocelyne Allen' } },
        ],
        featured_book_series: { position: '1.5', series: { name: 'No Longer Human' } },
      },
    }), 902));

    expect(book.authors.map(({ name, job }) => [name, job])).toEqual([
      ['Junji Ito', 'Author, Illustrator'],
      ['Jocelyne Allen', 'Translator'],
    ]);
    expect(book.series).toEqual({ name: 'No Longer Human', position: 1.5 });
  });
});

describe('getAuthor', () => {
  test('books group by role with the author row first, and a book sits on a role once', async () => {
    const author = await Effect.runPromise(getAuthor(deps({
      authors_by_pk: { id: 1, name: 'Junji Ito', slug: 'junji-ito' },
      books: [
        { id: 10, title: 'Narrated', contributions: [{ contribution: 'Narrator' }] },
        { id: 11, title: 'Written', contributions: [{ contribution: null }, { contribution: '' }] },
      ],
    }), 1));

    expect(author.rows.map(({ role, items }) => [role, items.map((item) => item.id)])).toEqual([
      ['Author', ['hardcover-11']],
      ['Narrator', ['hardcover-10']],
    ]);
  });
});
