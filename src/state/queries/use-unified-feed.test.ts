import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

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

const { feedOptions, mergeYourShows } = await import('./use-unified-feed');

function item(
  id: string,
  title: string,
  overrides: Partial<NormalizedMediaItem> = {},
): NormalizedMediaItem {
  return {
    id,
    title,
    coverImage: '',
    type: 'TV',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-31T00:00:00.000Z',
    externalIds: {},
    ...overrides,
  };
}

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

describe('yourShowsSimkl slot (plan 0034 U7)', () => {
  test('merges shows + anime buckets, dropping movies and plantowatch', async () => {
    routes = [
      [
        'api.simkl.com/sync/all-items',
        {
          shows: [
            { status: 'watching', show: { title: 'Severance', ids: { simkl: 1 } } },
            { status: 'plantowatch', show: { title: 'Plan To Watch Show', ids: { simkl: 2 } } },
          ],
          movies: [
            { status: 'completed', movie: { title: 'Some Movie', ids: { simkl: 3 } } },
          ],
          anime: [
            { status: 'completed', show: { title: 'Frieren', ids: { simkl: 4 } } },
          ],
        },
      ],
    ];

    const items = await feedOptions.yourShowsSimkl().queryFn();

    expect(items.map((entry) => entry.id)).toEqual(['simkl-1', 'simkl-4']);
    // One unfiltered snapshot, not a per-bucket loop (R26 precedent).
    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain('/sync/all-items?');
  });
});

describe('mergeYourShows (plan 0034 KTD-10/R10)', () => {
  test('Simkl wins metadata for the same TMDB id', () => {
    const trakt = [item('trakt-1', 'Severance (Trakt)', { externalIds: { tmdb: 100, trakt: 1 } })];
    const simkl = [item('simkl-1', 'Severance (Simkl)', { externalIds: { tmdb: 100, simkl: 1 } })];

    const merged = mergeYourShows(trakt, simkl);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('simkl-1');
  });

  test('a Simkl-only item with no Trakt twin still appears', () => {
    const simkl = [item('simkl-1', 'Frieren', { type: 'ANIME', externalIds: { simkl: 1 } })];

    const merged = mergeYourShows([], simkl);

    expect(merged.map((entry) => entry.id)).toEqual(['simkl-1']);
  });

  test('two id-less items from different providers never collide', () => {
    const trakt = [item('trakt-1', 'No Id Trakt')];
    const simkl = [item('simkl-1', 'No Id Simkl')];

    const merged = mergeYourShows(trakt, simkl);

    expect(merged).toHaveLength(2);
  });

  test('preserves first-seen order (Trakt-only items keep their place)', () => {
    const trakt = [
      item('trakt-1', 'A', { externalIds: { tmdb: 1 } }),
      item('trakt-2', 'B', { externalIds: { tmdb: 2 } }),
    ];
    const simkl = [item('simkl-3', 'C', { externalIds: { tmdb: 3 } })];

    const merged = mergeYourShows(trakt, simkl);

    expect(merged.map((entry) => entry.id)).toEqual(['trakt-1', 'trakt-2', 'simkl-3']);
  });
});
