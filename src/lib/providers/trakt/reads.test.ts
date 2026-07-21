import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { ProviderSession } from '@/types/session';
import { getHistory, getWatchedShows } from './reads';
import type { TokenStore, TraktDeps } from './deps';

const SESSION: ProviderSession = {
  accessToken: 'tok',
  refreshToken: 'r',
  expiresAt: Number.MAX_SAFE_INTEGER,
};

const TOKENS: TokenStore = {
  get: () => SESSION,
  set: () => {},
  clear: () => {},
};

function watchedShow(traktId: number) {
  return {
    plays: 1,
    last_watched_at: '2026-07-13T00:00:00.000Z',
    last_updated_at: '2026-07-13T00:00:00.000Z',
    show: { title: `Show ${traktId}`, ids: { trakt: traktId } },
    seasons: [{ number: 1, episodes: [{ number: 1, last_watched_at: '2026-07-13T00:00:00.000Z' }] }],
  };
}

/**
 * Serves /sync/watched/shows page by page (1-indexed) and records every
 * request URL, so the pagination loop's stop condition is observable.
 */
function pagedDeps(pages: unknown[][], requested: string[]) {
  const deps: TraktDeps = {
    tokens: TOKENS,
    clientId: 'id',
    clientSecret: 'secret',
    fetch: async (input) => {
      const url = new URL(String(input));
      requested.push(url.pathname + url.search);
      const page = Number(url.searchParams.get('page'));
      return new Response(JSON.stringify(pages[page - 1] ?? []), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
  return deps;
}

describe('getWatchedShows pagination (2026 Trakt API change)', () => {
  test('requests extended=progress and stops after a short page', async () => {
    const requested: string[] = [];
    // Page 1 full (100 items), page 2 short — loop must stop at page 2.
    const pages = [
      Array.from({ length: 100 }, (_, i) => watchedShow(i + 1)),
      [watchedShow(101)],
    ];
    const items = await Effect.runPromise(
      getWatchedShows(pagedDeps(pages, requested)),
    );

    expect(requested).toEqual([
      '/sync/watched/shows?extended=progress&page=1&limit=100',
      '/sync/watched/shows?extended=progress&page=2&limit=100',
    ]);
    expect(items).toHaveLength(101);
    // extended=progress seasons drive currentProgress (watched episode count).
    expect(items[0]?.currentProgress).toBe(1);
  });

  test('a single short page makes exactly one request', async () => {
    const requested: string[] = [];
    const items = await Effect.runPromise(
      getWatchedShows(pagedDeps([[watchedShow(1)]], requested)),
    );
    expect(requested).toHaveLength(1);
    expect(items).toHaveLength(1);
  });
});

/** Serves a fixed body/status for `/sync/history`, recording the request URL. */
function historyDeps(
  handler: (page: number) => Response,
  requested: string[],
): TraktDeps {
  return {
    tokens: TOKENS,
    clientId: 'id',
    clientSecret: 'secret',
    fetch: async (input) => {
      const url = new URL(String(input));
      requested.push(url.pathname + url.search);
      return handler(Number(url.searchParams.get('page')));
    },
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getHistory (diary source, plan 0016)', () => {
  test('requests one page at extended=full and normalizes rows', async () => {
    const requested: string[] = [];
    const deps = historyDeps(
      () =>
        json([
          {
            id: 1,
            watched_at: '2026-07-20T18:30:00.000Z',
            type: 'movie',
            movie: { title: 'Perfect Blue', year: 1997, ids: { trakt: 100 } },
          },
        ]),
      requested,
    );

    const entries = await Effect.runPromise(getHistory(deps, { page: 3 }));

    expect(requested).toEqual(['/sync/history?extended=full&page=3&limit=50']);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('trakt-1');
  });

  test('an empty page returns [] (the exhaustion signal)', async () => {
    const requested: string[] = [];
    const entries = await Effect.runPromise(
      getHistory(historyDeps(() => json([]), requested), { page: 9 }),
    );
    expect(entries).toEqual([]);
  });

  test('a malformed payload surfaces a tagged provider error, not a throw', async () => {
    const requested: string[] = [];
    const deps = historyDeps(
      () =>
        new Response('<html>nope</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      requested,
    );

    const exit = await Effect.runPromiseExit(getHistory(deps, { page: 1 }));
    expect(exit._tag).toBe('Failure');
  });
})
