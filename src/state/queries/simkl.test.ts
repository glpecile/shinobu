import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { normalizeAllItems } from '@/lib/providers/simkl/normalize';
import { simklEpisodeIsWatched } from '@/lib/providers/simkl/episode-state';

// Import-time stubs only: MMKV, the native fetch client and react-native's
// entry point don't load under bun. Nothing here goes near the network.
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
// simkl/auth.ts (reached via ./simkl's exchange re-wiring) imports expo-crypto
// at module load, which pulls the whole expo package under bun — mirror the
// surface it consumes instead (lib/providers/simkl/auth.test.ts pattern).
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

const { findLibraryEntry, findLibraryEpisodeState, simklDeps } = await import('./simkl');
const { clearProviderClientId, setProviderClientId } = await import(
  '@/state/session/tokens'
);

// bun loads .env files — pin the env id per test so precedence is deterministic.
const ORIGINAL_SIMKL_ENV = process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID;

beforeEach(() => {
  store.clear();
  process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID = ORIGINAL_SIMKL_ENV;
});

describe('simklDeps (plan 0034 U5)', () => {
  test('an in-app override wins over the env id (Trakt-style precedence)', () => {
    process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID = 'env-client-id';
    setProviderClientId('simkl', 'override-client-id');
    expect(simklDeps().clientId).toBe('override-client-id');
    clearProviderClientId('simkl');
    expect(simklDeps().clientId).toBe('env-client-id');
  });
});

// The lookup behind `useSimklWatchedInfo` (owner report 2026-08-01: a movie
// logged to Simkl still offered "Mark as watched"). The `completed` snapshot
// is where a watched film lives, and it must be searched by the item's own
// type — TMDB numbers movies and TV separately, so a flat scan cross-matches.
const item = (
  id: string,
  type: 'MOVIE' | 'TV' | 'ANIME',
  ids: { simkl?: number; tmdb?: number },
  extra: Record<string, unknown> = {},
) =>
  ({
    id,
    title: id,
    type,
    currentProgress: 1,
    progressUnit: 'episode',
    lastUpdated: '2026-05-22T21:00:00Z',
    externalIds: ids,
    ...extra,
  }) as never;

const entry = (
  id: string,
  type: 'MOVIE' | 'TV' | 'ANIME',
  ids: { simkl?: number; tmdb?: number },
  extra: Record<string, unknown> = {},
) =>
  ({
    item: item(id, type, ids, extra),
    status: 'completed',
    lastWatchedAt: '2026-05-22T21:00:00Z',
    watchedKeys: new Set<string>(),
    watchedEpisodes: [],
  }) as never;

const library = (over: Record<string, unknown>) =>
  ({ shows: [], movies: [], anime: [], ...over }) as never;

describe('findLibraryEntry', () => {
  test('a movie is found in the movies bucket', () => {
    const found = findLibraryEntry(
      library({ movies: [entry('simkl-1', 'MOVIE', { simkl: 1, tmdb: 42 })] }),
      item('subject', 'MOVIE', { tmdb: 42 }),
    );
    expect(found?.item.id).toBe('simkl-1');
  });

  test('a TV item never cross-matches a movie sharing its TMDB id', () => {
    expect(
      findLibraryEntry(
        library({ movies: [entry('simkl-1', 'MOVIE', { tmdb: 42 })] }),
        item('subject', 'TV', { tmdb: 42 }),
      ),
    ).toBeNull();
  });

  test('an anime film is found in the anime bucket, not movies', () => {
    const film = entry('simkl-9', 'ANIME', { simkl: 9, tmdb: 42 }, { isFilm: true });
    const films = library({
      movies: [entry('simkl-8', 'MOVIE', { simkl: 8, tmdb: 42 })],
      anime: [film],
    });
    const found = findLibraryEntry(
      films,
      item('subject', 'ANIME', { simkl: 9, tmdb: 42 }, { isFilm: true }),
    );
    expect(found?.item.id).toBe('simkl-9');
    expect(findLibraryEntry(library({ anime: [film] }), item('film', 'MOVIE', { tmdb: 42 }))).toBe(film);
  });

  test('an anime season never matches a sibling season sharing its TMDB id', () => {
    const seasons = library({
      anime: [
        entry('simkl-1', 'ANIME', { simkl: 1, tmdb: 42 }),
        entry('simkl-2', 'ANIME', { simkl: 2, tmdb: 42 }),
      ],
    });
    expect(findLibraryEntry(seasons, item('s3', 'ANIME', { simkl: 3, tmdb: 42 }))).toBeNull();
    expect(findLibraryEntry(seasons, item('s3', 'ANIME', { tmdb: 42 }))).toBeNull();
    expect(findLibraryEntry(seasons, item('s2', 'ANIME', { simkl: 2, tmdb: 42 }))?.item.id).toBe('simkl-2');
  });

  test('ordinary shows prefer an exact ID before TMDB fallback and keep completed aired marks', () => {
    const first = entry('simkl-1', 'TV', { simkl: 1, tmdb: 42 });
    const second = entry('simkl-2', 'TV', { simkl: 2, tmdb: 42 });
    const shows = library({ shows: [first, second] });
    expect(findLibraryEntry(shows, item('tv', 'TV', { simkl: 2, tmdb: 42 }))).toBe(second);
    expect(findLibraryEntry(shows, item('tv', 'TV', { tmdb: 42 }))).toBe(first);
    const state = findLibraryEpisodeState(shows, item('tv', 'TV', { tmdb: 42 }));
    expect(simklEpisodeIsWatched(state, 2, 11, '2020-01-01')).toBe(true);
    expect(simklEpisodeIsWatched(state, 2, 12, '2999-01-01')).toBe(false);
  });
});

describe('canonical Simkl episode state', () => {
  test('Saga of Tanya the Evil S2E11 stays unwatched when only season 1 is complete', () => {
    const snapshot = normalizeAllItems({ anime: [
      {
        status: 'completed', mapped_tvdb_seasons: [1], watched_episodes_count: 12,
        show: { title: 'Youjo Senki', ids: { simkl: 555226, tmdb: 69346 } },
      },
      {
        status: 'watching', mapped_tvdb_seasons: [2],
        show: { title: 'Youjo Senki II', ids: { simkl: 1670325, tmdb: 69346 } },
        seasons: [{ number: 1, episodes: [
          { number: 1, tvdb: { season: 2, episode: 1 }, watched_at: '2026-09-01T00:00:00Z' },
          { number: 11 },
        ] }],
      },
      {
        status: 'completed', mapped_tvdb_seasons: [0],
        show: { title: 'ONA', ids: { simkl: 3, tmdb: 69346 } },
      },
      {
        status: 'completed', anime_type: 'movie', mapped_tvdb_seasons: [2],
        show: { title: 'Unrelated film ID collision', ids: { simkl: 4, tmdb: 69346 } },
      },
    ] }, '2026-09-27T00:00:00Z');
    // Both a search result and a TV-shaped detail enriched with a cour ID
    // need the same full-show episode view.
    for (const ids of [{ tmdb: 69346 }, { tmdb: 69346, simkl: 555226 }]) {
      const state = findLibraryEpisodeState(snapshot, item('tanya', 'TV', ids));
      expect(simklEpisodeIsWatched(state, 1, 11, '2017-01-01')).toBe(true);
      expect(simklEpisodeIsWatched(state, 2, 11, '2026-09-01')).toBe(false);
      expect(simklEpisodeIsWatched(state, 2, 1, '2026-09-01')).toBe(true);
      expect(state?.watchedEpisodes).toEqual([{ season: 2, number: 1, watchedAt: '2026-09-01T00:00:00Z' }]);
      expect(simklEpisodeIsWatched(state, 1, 13, '2999-01-01')).toBe(false);
    }
    const cour = findLibraryEpisodeState(snapshot, item('cour', 'ANIME', { simkl: 1670325, tmdb: 69346 }));
    expect(simklEpisodeIsWatched(cour, 1, 11, '2017-01-01')).toBe(false);
  });

  test('unmapped completed anime cannot imply a whole show, and overlapping incomplete cours block season inference', () => {
    const snapshot = normalizeAllItems({ anime: [
      { status: 'completed', show: { title: 'Unmapped', ids: { simkl: 1, tmdb: 42 } } },
      { status: 'completed', mapped_tvdb_seasons: [2], show: { title: 'Part 1', ids: { simkl: 2, tmdb: 42 } } },
      { status: 'watching', mapped_tvdb_seasons: [2], show: { title: 'Part 2', ids: { simkl: 3, tmdb: 42 } },
        seasons: [{ number: 1, episodes: [{ number: 1, tvdb: { season: 2, episode: 13 } }] }] },
    ] }, '2026-09-27T00:00:00Z');
    const state = findLibraryEpisodeState(snapshot, item('show', 'TV', { tmdb: 42 }));
    expect(simklEpisodeIsWatched(state, 1, 1, '2020-01-01')).toBe(false);
    expect(simklEpisodeIsWatched(state, 2, 14, '2020-01-01')).toBe(false);
    expect(simklEpisodeIsWatched(state, 2, 13, '2020-01-01')).toBe(true);
    expect(state?.watchedKeys.has('1-1')).toBe(false);
  });
});
