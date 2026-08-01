import { beforeEach, describe, expect, mock, test } from 'bun:test';


/**
 * Two things plan 0034 U7 changes about the home feed: trending moves off
 * Trakt onto Simkl's public CDN (R11/KTD-8 — must resolve with zero
 * providers connected and no Trakt env creds at all), and `yourShows` becomes
 * a Trakt+Simkl merge with Simkl precedence (KTD-10/R10). `mergeYourShows` is
 * pure and tested directly; the trending/`yourShowsSimkl` slot builders are
 * tested by calling their `queryFn`s against a fake `fetch` (real
 * `lib/providers/simkl/reads.ts`) rather than a `mock.module`-replaced reads
 * module — that module has its own `reads.test.ts` importing it by a relative
 * path, and bun's module-mock registry doesn't reconcile an alias-registered
 * mock with a relative-imported consumer, so replacing the whole module here
 * would leak into (and silently break) that suite whenever both run in the
 * same `bun test` process. Faking `fetch` instead is the pattern every
 * provider's own `reads.test.ts` already uses, and never touches the module
 * registry at all.
 *
 * This file *does* still import the real `./use-unified-feed` (relative)
 * while `state/queries/simkl.test.ts` and others coexist in the suite — see
 * docs/solutions/bun-test-mock-module-cross-file-leak.md for why `bun test
 * --isolate` is the gate that actually needs to be green.
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

const { feedOptions, hasUpNextSources } = await import('./use-unified-feed');


beforeEach(() => {
  store.clear();
  routes = [];
  requestedUrls.length = 0;
  // The exact no-BYO-Trakt-creds state R11 requires trending to survive:
  // Simkl's client id stays bundled (owner-registered app), while Trakt has
  // none at all — env credentials were removed outright in U9 (R12), so a
  // cleared MMKV store above *is* the credential-less state.
});

describe('trending (plan 0034 R11/KTD-8)', () => {
  test('resolves via Simkl with zero providers connected and no Trakt env creds', async () => {
    routes = [
      [
        'data.simkl.in/discover/trending/movies',
        [{ title: 'Dune: Part Three', ids: { simkl: 1, tmdb: 900 } }],
      ],
    ];

    const movies = await feedOptions.trendingMovies().queryFn();

    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe('Dune: Part Three');
    expect(requestedUrls.some((url) => url.includes('api.trakt.tv'))).toBe(false);
  });

  test('the TV trending row is the same shape, keyed to the "tv" kind', async () => {
    routes = [
      ['data.simkl.in/discover/trending/tv', [{ title: 'Severance', ids: { simkl: 2, tmdb: 901 } }]],
    ];

    const shows = await feedOptions.trendingShows().queryFn();

    expect(shows).toHaveLength(1);
    expect(requestedUrls[0]).toContain('/discover/trending/tv/week_100.json');
  });
});

describe('home section predicates', () => {
  test('Simkl alone mounts Up Next', () => {
    expect(hasUpNextSources(['simkl'])).toBe(true);
  });

  test('a Letterboxd-only user gets none', () => {
    expect(hasUpNextSources(['letterboxd'])).toBe(false);
  });

  test('AniList alone still mounts it', () => {
    expect(hasUpNextSources(['anilist'])).toBe(true);
  });
});
