import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { ProviderSession } from '@/types/session';
import { getWatchedShows } from './reads';
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
