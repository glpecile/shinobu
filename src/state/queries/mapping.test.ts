import { QueryClient } from '@tanstack/react-query';
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * `mapping.ts`'s Trakt-riding lookups (`cachedTraktLookup`, `movieSearchQuery`
 * behind `cachedTraktTextSearch`/`useMovieCatalogueQuery`, and the
 * `cachedSeasonLayout` Trakt fallback) migrate off an unconditional
 * `traktDeps()` call to a credentials gate — Trakt when
 * `getClientIdForProvider('trakt')` resolves, Simkl/TMDB otherwise (plan 0034
 * KTD-8). This suite pins that gate at the HTTP boundary (real trakt/simkl/tmdb
 * `reads.ts` functions, fake `fetch`) rather than replacing the read modules
 * with `mock.module` — `lib/providers/{trakt,simkl,tmdb}/reads.test.ts` import
 * those same modules by a relative path, and bun's module-mock registry
 * doesn't reconcile an alias-registered mock with a relative-imported
 * consumer, so swapping the whole module out here would leak into (and
 * silently break) those suites whenever both run in the same `bun test`
 * process. Faking `fetch` instead is the pattern every provider's own
 * `reads.test.ts` (under `lib/providers`) and `lib/providers/media-details
 * .test.ts` already use, and never touches the module registry at all.
 *
 * This file *does* still import the real `./mapping` (relative) while other
 * suites (`enrich.test.ts`, `use-log-media.test.ts`, …) fake the whole
 * module via `mock.module('@/state/queries/mapping', …)` — that combination
 * needs `bun test --isolate` to pass as a full suite; see
 * docs/solutions/bun-test-mock-module-cross-file-leak.md.
 */

const store = new Map<string, string>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => store.set(key, value),
    remove: (key: string) => store.delete(key),
    getAllKeys: () => [...store.keys()],
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));

/** Routes each request by URL substring; unmatched URLs 404 (media-details.test.ts pattern). */
let routes: Array<[match: string, body: unknown, status?: number]> = [];
const requestedUrls: string[] = [];
mock.module('@/lib/http/client', () => ({
  httpFetch: async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    requestedUrls.push(url);
    const hit = routes.find(([match]) => url.includes(match));
    if (hit == null) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(hit[1]), {
      status: hit[2] ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
}));
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web },
}));
// `./simkl` (state/queries/simkl.ts) reaches expo-crypto via its auth
// re-export — mirror the surface it consumes rather than load the whole expo
// package under bun (the `state/queries/simkl.test.ts` pattern).
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

// `tmdbToken()` is gated on `isServer()` (`typeof window === 'undefined'`,
// docs/solutions/expo-web-ssr-mmkv-storage-on-server.md) and bun has no
// `window` by default — faked in here (the `letterboxd.test.ts`/
// `up-next.test.ts` precedent) so `movieSearchQuery`'s TMDB fallback actually
// resolves a token instead of reading as permanently server-side. Removed
// afterwards — bun shares one process across files.
const globals = globalThis as { window?: unknown };
globals.window = {};
afterAll(() => {
  delete globals.window;
});

const {
  cachedSeasonLayout,
  cachedTraktLookup,
  cachedTraktTextSearch,
  mappingQueryKeys,
} = await import('./mapping');
const { setProviderClientId, clearProviderClientId } = await import(
  '@/state/session/tokens'
);
const { clearTmdbToken } = await import('@/state/session/tmdb-token');

const ORIGINAL_TRAKT_ENV = process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID;

beforeEach(() => {
  store.clear();
  routes = [];
  requestedUrls.length = 0;
  process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = ORIGINAL_TRAKT_ENV;
  clearProviderClientId('trakt');
  // `tmdbToken()` caches its resolved value at module scope — reset both the
  // stored value and the cache so each test's env var actually takes effect
  // instead of leaking the previous test's (or the real dev `.env`'s) token.
  process.env.EXPO_PUBLIC_TMDB_TOKEN = '';
  clearTmdbToken();
});

function freshClient() {
  return new QueryClient();
}

function calledHost(host: string): boolean {
  return requestedUrls.some((url) => url.includes(host));
}

describe('cachedTraktLookup (plan 0034 KTD-8)', () => {
  test('with Trakt credentials, resolves via Trakt and never touches Simkl', async () => {
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = 'trakt-cid';
    routes = [
      ['api.trakt.tv/search/tmdb/949', [{ type: 'movie', movie: { title: 'Heat', ids: { trakt: 1 } } }]],
    ];

    const result = await cachedTraktLookup(freshClient(), {
      source: 'tmdb',
      id: 949,
      kind: 'movie',
    });

    expect(result?.id).toBe('trakt-1');
    expect(calledHost('api.trakt.tv')).toBe(true);
    expect(calledHost('api.simkl.com')).toBe(false);
  });

  test('with no Trakt credentials, falls back to Simkl `/search/id`', async () => {
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = '';
    routes = [
      ['api.simkl.com/search/id', [{ type: 'movie', title: 'Heat', ids: { simkl: 5 } }]],
    ];

    const result = await cachedTraktLookup(freshClient(), {
      source: 'tmdb',
      id: 949,
      kind: 'movie',
    });

    expect(result?.id).toBe('simkl-5');
    expect(calledHost('api.trakt.tv')).toBe(false);
    expect(calledHost('api.simkl.com')).toBe(true);
    const simklUrl = requestedUrls.find((url) => url.includes('api.simkl.com'));
    expect(simklUrl).toContain('tmdb=949');
    expect(simklUrl).toContain('type=movie');
  });

  test('a Simkl miss (empty array) resolves to null, not an error', async () => {
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = '';
    routes = [['api.simkl.com/search/id', []]];

    const result = await cachedTraktLookup(freshClient(), {
      source: 'imdb',
      id: 'tt0113277',
      kind: 'movie',
    });

    expect(result).toBeNull();
  });

  test('an in-app Trakt client id override counts as credentials, same as env', async () => {
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = '';
    setProviderClientId('trakt', 'byo-cid');
    routes = [
      ['api.trakt.tv/search/tmdb/1', [{ type: 'movie', movie: { title: 'Drive', ids: { trakt: 2 } } }]],
    ];

    const result = await cachedTraktLookup(freshClient(), {
      source: 'tmdb',
      id: 1,
      kind: 'movie',
    });

    expect(result?.id).toBe('trakt-2');
    expect(calledHost('api.simkl.com')).toBe(false);
  });
});

describe('cachedTraktTextSearch / movieSearchQuery (plan 0034 KTD-8)', () => {
  test('with Trakt credentials, searches Trakt and never touches TMDB', async () => {
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = 'trakt-cid';
    routes = [
      [
        'api.trakt.tv/search/movie,show',
        [{ type: 'movie', movie: { title: 'Heat', year: 1995, ids: { trakt: 1 } } }],
      ],
    ];

    const result = await cachedTraktTextSearch(freshClient(), 'Heat', 1995);

    expect(result?.id).toBe('trakt-1');
    expect(calledHost('api.trakt.tv')).toBe(true);
    expect(calledHost('api.themoviedb.org')).toBe(false);
  });

  test('with no Trakt credentials but a TMDB token, falls back to TMDB search', async () => {
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = '';
    process.env.EXPO_PUBLIC_TMDB_TOKEN = 'tmdb-token';
    routes = [
      [
        'api.themoviedb.org/3/search/movie',
        { results: [{ id: 949, title: 'Heat', release_date: '1995-12-15' }] },
      ],
    ];

    const result = await cachedTraktTextSearch(freshClient(), 'Heat', 1995);

    expect(result?.externalIds.tmdb).toBe(949);
    expect(calledHost('api.trakt.tv')).toBe(false);
    expect(calledHost('api.themoviedb.org')).toBe(true);
  });

  test('with neither Trakt nor TMDB available, resolves to null without a network call', async () => {
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = '';
    process.env.EXPO_PUBLIC_TMDB_TOKEN = '';

    const result = await cachedTraktTextSearch(freshClient(), 'Heat', 1995);

    expect(result).toBeNull();
    expect(requestedUrls).toHaveLength(0);
  });
});

describe('cachedSeasonLayout (plan 0034 KTD-8)', () => {
  test('TMDB answers first regardless of Trakt credentials', async () => {
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = 'trakt-cid';
    routes = [
      [
        'api.themoviedb.org/3/tv/100',
        { seasons: [{ season_number: 1, episode_count: 12 }] },
      ],
    ];

    const layout = await cachedSeasonLayout(freshClient(), { tmdb: 100, trakt: 200 });

    expect(layout).toEqual([{ season: 1, episodeCount: 12 }]);
    expect(calledHost('api.themoviedb.org')).toBe(true);
    expect(calledHost('api.trakt.tv')).toBe(false);
  });

  test('falls through to Trakt when TMDB has no data and Trakt has credentials', async () => {
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = 'trakt-cid';
    routes = [
      ['api.themoviedb.org/3/tv/100', { seasons: [] }],
      ['api.trakt.tv/shows/200/seasons', [{ number: 1, episode_count: 10 }]],
    ];

    const layout = await cachedSeasonLayout(freshClient(), { tmdb: 100, trakt: 200 });

    expect(layout).toEqual([{ season: 1, episodeCount: 10 }]);
  });

  test('skips Trakt entirely (no call at all) when it has no credentials', async () => {
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = '';
    routes = [
      ['api.themoviedb.org/3/tv/100', { seasons: [] }],
      ['api.trakt.tv/shows/200/seasons', [{ number: 1, episode_count: 10 }]],
    ];

    const layout = await cachedSeasonLayout(freshClient(), { tmdb: 100, trakt: 200 });

    expect(layout).toBeNull();
    expect(calledHost('api.trakt.tv')).toBe(false);
  });

  test('resolves to null immediately when neither id is known', async () => {
    const layout = await cachedSeasonLayout(freshClient(), {});
    expect(layout).toBeNull();
    expect(requestedUrls).toHaveLength(0);
  });
});

describe('mappingQueryKeys.traktLookup (unchanged shape — KTD-8 keeps consumers stable)', () => {
  test('the cache key stays keyed by source/id/kind, whichever provider answers it', () => {
    expect(mappingQueryKeys.traktLookup('tmdb', 949, 'movie')).toEqual([
      'mapping',
      'trakt-lookup',
      'tmdb',
      949,
      'movie',
    ]);
  });
});
