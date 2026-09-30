import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import type { HttpFetch } from '@/lib/http/types';

/**
 * Trending runs off Simkl's public CDN and must resolve with zero providers
 * connected and no Trakt credentials (plan 0034 R11/KTD-8). Its `queryFn` runs
 * against a fake `fetch` (real `lib/providers/simkl/reads.ts`), not a
 * `mock.module`-replaced reads module: `reads.test.ts` imports that module by a
 * relative path, and bun's module-mock registry doesn't reconcile an
 * alias-registered mock with a relative-imported consumer, so replacing it
 * here would silently break that suite in a shared `bun test` process.
 *
 * `bun test --isolate` is the gate that must be green for this file
 * (docs/solutions/bun-test-mock-module-cross-file-leak.md).
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
let fetchOverride: HttpFetch | undefined;
mock.module('@/lib/http/client', () => ({
  httpFetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (fetchOverride != null) return fetchOverride(input, init);
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

const { feedOptions, hasUpNextSources } = await import('./use-unified-feed');

beforeEach(() => {
  store.clear();
  routes = [];
  requestedUrls.length = 0;
  fetchOverride = undefined;
  // The exact no-BYO-Trakt-creds state R11 requires trending to survive:
  // Simkl's client id stays bundled (owner-registered app), while Trakt has
  // none at all — env credentials were removed outright in U9 (R12), so a
  // cleared MMKV store above *is* the credential-less state.
});

describe('trending (plan 0034 R11/KTD-8)', () => {
  test('cancelling a query aborts its provider transport', async () => {
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    let aborted = false;
    fetchOverride = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('Cancelled', 'AbortError'));
      }, { once: true });
      notifyStarted();
    });
    const client = new QueryClient();
    const options = feedOptions.trendingMovies();
    const pending = client.fetchQuery(options).catch(() => null);
    await started;
    await client.cancelQueries({ queryKey: options.queryKey });
    expect(await pending).toBeNull();
    expect(aborted).toBe(true);
  });

  test('resolves via Simkl with zero providers connected and no Trakt env creds', async () => {
    routes = [
      [
        'data.simkl.in/discover/trending/movies',
        [{ title: 'Dune: Part Three', ids: { simkl: 1, tmdb: 900 } }],
      ],
    ];

    const movies = await new QueryClient().fetchQuery(feedOptions.trendingMovies());

    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe('Dune: Part Three');
    expect(requestedUrls.some((url) => url.includes('api.trakt.tv'))).toBe(false);
  });
});

describe('home section predicates', () => {
  test('Simkl alone mounts Up Next', () => {
    expect(hasUpNextSources(['simkl'])).toBe(true);
  });

  test('a Letterboxd-only user gets none', () => {
    expect(hasUpNextSources(['letterboxd'])).toBe(false);
  });
});
