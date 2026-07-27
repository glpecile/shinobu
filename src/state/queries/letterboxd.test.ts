import type { QueryClient } from '@tanstack/react-query';
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';

import type { TmdbMediaCatalogue } from '@/lib/providers/tmdb/normalize';
import type { NormalizedMediaItem } from '@/types/media';

// Import-time stubs only: MMKV, the native fetch client and react-native's
// entry point don't load under bun.
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
mock.module('@/lib/http/client', () => ({
  httpFetch: async () => new Response('{}'),
}));
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web },
}));

// The TMDB token read is gated on `isServer()` (`typeof window === 'undefined'`,
// docs/solutions/expo-web-ssr-mmkv-storage-on-server.md) and bun has no
// `window`. That gate is also what makes the no-token case testable at all:
// `tmdbToken()` memoizes the first *client* read for the process, so the
// no-token suite below runs first, while `window` is still absent, and the
// window is only faked in for the suites that need a token. Removed afterwards
// — bun shares one process across files.
const globals = globalThis as { window?: unknown };
afterAll(() => {
  delete globals.window;
});

const { fetchLetterboxdReleaseInputs, letterboxdQueryKeys } = await import(
  './letterboxd'
);
// Written through the session layer's own setters rather than into the map
// above: `mock.module` is process-wide and the last registration wins, so
// `tokens.ts` may well have captured another suite's fake MMKV. Going through
// the real writers lands the session in whichever store is actually live.
const { setProviderSession, setStoredTmdbToken } = await import(
  '@/state/session/tokens'
);

const NOW = new Date('2026-07-27T12:00:00.000Z');

/**
 * A watchlist row. `tmdb` is the one liberty these fixtures take: a real scrape
 * never carries an id, but the id leg (`cachedTmdbMovieIdByTitle`) is a module
 * import rather than a `fetchQuery` key, and other suites replace that module
 * process-wide. Pre-supplying the id isolates what *this* layer owns — the
 * filter, the catalogue read and the query keys — while the year-gated matching
 * it would otherwise run is covered in `features/up-next/letterboxd-releases.test.ts`.
 */
function film(
  slug: string,
  title: string,
  year?: number,
  tmdb?: number,
): NormalizedMediaItem {
  return {
    id: `letterboxd-${slug}`,
    title,
    coverImage: '',
    ...(year != null ? { year } : {}),
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-27T00:00:00.000Z',
    externalIds: { letterboxd: slug, ...(tmdb != null ? { tmdb } : {}) },
  };
}

interface Scenario {
  watchlist?: NormalizedMediaItem[];
  /** TMDB id → its `releaseCalendar`, as the catalogue read carries it. */
  dates?: Record<number, NormalizedMediaItem['releaseCalendar']>;
  /** TMDB ids whose catalogue read rejects. */
  failingCatalogue?: number[];
  failingWatchlist?: boolean;
}

/**
 * Every leg of the resolve goes through `queryClient.fetchQuery`, so a client
 * that answers by query key is the whole seam — and the keys it is asked for
 * are the assertion that the watchlist read shares the feed row's cache entry
 * and that the id mapping is the forever-cached one.
 */
function fakeClient(scenario: Scenario) {
  const keys: unknown[][] = [];
  const fetchQuery = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
    keys.push([...queryKey]);
    const [root, kind] = queryKey as [string, string];
    if (root === 'letterboxd' && kind === 'watchlist') {
      if (scenario.failingWatchlist === true) throw new Error('watchlist 429');
      return scenario.watchlist ?? [];
    }
    if (root === 'mapping' && kind === 'tmdb-movie-search') return null;
    if (root === 'tmdb' && kind === 'catalogue') {
      const tmdbId = queryKey[3] as number;
      if (scenario.failingCatalogue?.includes(tmdbId) === true) {
        throw new Error(`catalogue ${tmdbId} down`);
      }
      return {
        catalogue: {
          id: `tmdb-${tmdbId}`,
          title: `TMDB ${tmdbId}`,
          coverImage: '',
          type: 'MOVIE',
          currentProgress: 0,
          progressUnit: 'episode',
          lastUpdated: '2026-07-27T00:00:00.000Z',
          externalIds: { tmdb: tmdbId },
          ...(scenario.dates?.[tmdbId] != null
            ? { releaseCalendar: scenario.dates[tmdbId] }
            : {}),
        },
        cast: [],
        crew: [],
        studios: [],
      } satisfies TmdbMediaCatalogue;
    }
    throw new Error(`unexpected query: ${queryKey.join('/')}`);
  };
  return { client: { fetchQuery } as unknown as QueryClient, keys };
}

describe('fetchLetterboxdReleaseInputs — without a TMDB token', () => {
  beforeAll(() => {
    setProviderSession('letterboxd', { accessToken: '', username: 'cinephile' });
  });

  test('contributes nothing and spends no request', async () => {
    const { client, keys } = fakeClient({
      watchlist: [film('the-drama', 'The Drama', 2026)],
    });

    // There is no resolve without a token, so firing the scrape would buy
    // nothing — the source degrades to absent, never to an error.
    expect(await fetchLetterboxdReleaseInputs(client, NOW)).toEqual([]);
    expect(keys).toEqual([]);
  });
});

describe('fetchLetterboxdReleaseInputs', () => {
  beforeAll(() => {
    setProviderSession('letterboxd', { accessToken: '', username: 'cinephile' });
    setStoredTmdbToken('tmdb-read-token');
    globals.window = {};
  });

  test('resolves the filtered watchlist into dated, letterboxd-tagged inputs', async () => {
    const { client, keys } = fakeClient({
      watchlist: [
        film('the-drama', 'The Drama', 2026, 1234),
        film('casablanca', 'Casablanca', 1942, 4321),
      ],
      dates: { 1234: { theatrical: '2026-07-31', digital: '2026-09-04' } },
    });

    const inputs = await fetchLetterboxdReleaseInputs(client, NOW);

    expect(inputs.map((input) => [input.kind, input.date, input.source])).toEqual([
      ['theatrical', '2026-07-31', 'letterboxd'],
      ['digital', '2026-09-04', 'letterboxd'],
    ]);
    // The 1942 film never reaches a request: the year filter runs before the fan
    // (KTD-5), which is the whole reason this source is affordable.
    expect(keys.filter((key) => key[1] === 'catalogue')).toEqual([
      ['tmdb', 'catalogue', 'movie', 1234],
    ]);
    // The watchlist read shares the "Your Watchlist" feed row's cache entry, so
    // on the home screen the scrape has usually already happened.
    expect(keys[0]).toEqual([...letterboxdQueryKeys.watchlist('cinephile')]);
  });

  test('a film no TMDB id could be found for contributes no entry', async () => {
    const { client } = fakeClient({
      watchlist: [film('the-odyssey', 'The Odyssey', 2026)],
    });

    // The id leg's year gate returns null rather than Kubrick's back catalogue
    // (docs/solutions/trakt-text-search-wrong-movie-match.md); a null id has to
    // stop the resolve dead instead of falling through to some other film.
    expect(await fetchLetterboxdReleaseInputs(client, NOW)).toEqual([]);
  });

  test('a failing catalogue read drops that film, not the source (R7)', async () => {
    const { client } = fakeClient({
      watchlist: [
        film('broken', 'Broken', 2026, 1),
        film('survivor', 'Survivor', 2026, 2),
      ],
      dates: { 2: { theatrical: '2026-08-01' } },
      failingCatalogue: [1],
    });

    const inputs = await fetchLetterboxdReleaseInputs(client, NOW);

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.item.id).toBe('letterboxd-survivor');
    // The resolved TMDB id rides on the item — without it the row could never
    // collapse against the same film on the Trakt watchlist (KTD-6).
    expect(inputs[0]?.item.externalIds.tmdb).toBe(2);
  });

  test('a watchlist that will not load fails the source, for `settle` to catch', async () => {
    const { client } = fakeClient({ failingWatchlist: true });

    // Deliberately *not* swallowed here: `fetchUpNextInputs` settles each source
    // separately, so a dead watchlist has to reach it as a rejection to be
    // reported as Letterboxd's error rather than as silence (R7).
    await expect(fetchLetterboxdReleaseInputs(client, NOW)).rejects.toThrow(
      'watchlist 429',
    );
  });

  test('and `fetchUpNextInputs` settles it as a Letterboxd error, not a throw', async () => {
    // The other end of the same contract (plan 0030 U8). It lives here rather
    // than in `up-next.test.ts` because reaching the resolve at all needs a TMDB
    // token, and `tmdbToken()` memoizes its first client read for the whole
    // process — so the suite that fakes a `window` in has to be the one that
    // already owns that state.
    const { fetchUpNextInputs } = await import('./up-next');
    const { client } = fakeClient({ failingWatchlist: true });

    const inputs = await fetchUpNextInputs(client, ['letterboxd']);

    expect(inputs.releases).toEqual([]);
    expect(inputs.errors).toEqual([
      { provider: 'letterboxd', message: 'watchlist 429' },
    ]);
  });
});
