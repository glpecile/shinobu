import { describe, expect, mock, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import type { HardcoverDeps } from './deps';

// The auth module behind `hardcoverRequest` keeps its PKCE flow in MMKV.
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({ getString: () => undefined, set: () => {}, remove: () => {} }),
}));

const { searchBooks } = await import('./reads');

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
