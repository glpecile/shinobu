import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Import-time stubs only: MMKV, the native fetch client and react-native's
// entry point don't load under bun. Nothing here goes near the network — the
// subjects are the query-key shape and the deps wiring.
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

const { findLibraryEntry, simklDeps, simklQueryKeys } = await import('./simkl');
const { clearProviderClientId, setProviderClientId, setProviderSession } =
  await import('@/state/session/tokens');

// bun loads .env files — pin the env id per test so precedence is deterministic.
const ORIGINAL_SIMKL_ENV = process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID;

beforeEach(() => {
  store.clear();
  process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID = ORIGINAL_SIMKL_ENV;
});

describe('simklQueryKeys (plan 0034 U5)', () => {
  test("every key is rooted at ['simkl'] so disconnect purges the whole scope", () => {
    const root = simklQueryKeys.all;
    for (const key of [
      simklQueryKeys.allItems(),
      simklQueryKeys.allItems('shows', 'watching'),
      simklQueryKeys.allItemsRoot(),
      simklQueryKeys.activities(),
      simklQueryKeys.calendar('tv'),
      simklQueryKeys.trending('movies'),
      simklQueryKeys.userSettings(),
    ]) {
      // useDisconnectProvider removes `{ queryKey: [id] }` — TanStack matches
      // by prefix, so rooting every key here is exactly what makes one purge
      // reach all of them (the AniList disconnect lesson).
      expect(key.slice(0, root.length)).toEqual([...root]);
    }
  });

  test('filtered and unfiltered all-items snapshots are distinct cache entries', () => {
    expect(simklQueryKeys.allItems()).not.toEqual(
      simklQueryKeys.allItems('shows') as never,
    );
    expect(simklQueryKeys.allItems('shows', 'watching')).not.toEqual(
      simklQueryKeys.allItems('shows', 'completed') as never,
    );
  });

  test('allItemsRoot prefixes every all-items filter (the write-side invalidation target)', () => {
    const root = simklQueryKeys.allItemsRoot();
    for (const key of [
      simklQueryKeys.allItems(),
      simklQueryKeys.allItems('shows'),
      simklQueryKeys.allItems('anime', 'plantowatch'),
    ]) {
      expect(key.slice(0, root.length)).toEqual([...root]);
    }
  });

  test('trending defaults to the week interval and keys intervals apart', () => {
    expect(simklQueryKeys.trending('tv')).toEqual(
      simklQueryKeys.trending('tv', 'week') as never,
    );
    expect(simklQueryKeys.trending('tv', 'today')).not.toEqual(
      simklQueryKeys.trending('tv', 'week') as never,
    );
  });
});

describe('simklDeps (plan 0034 U5)', () => {
  test('pulls the client id from env when no in-app override exists', () => {
    process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID = 'env-client-id';
    expect(simklDeps().clientId).toBe('env-client-id');
  });

  test('an in-app override wins over the env id (Trakt-style precedence)', () => {
    process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID = 'env-client-id';
    setProviderClientId('simkl', 'override-client-id');
    expect(simklDeps().clientId).toBe('override-client-id');
    clearProviderClientId('simkl');
    expect(simklDeps().clientId).toBe('env-client-id');
  });

  test('the token store reads/writes the simkl session slot', () => {
    const deps = simklDeps();
    expect(deps.tokens.get()).toBeNull();
    setProviderSession('simkl', { accessToken: 'tok-1' });
    expect(deps.tokens.get()).toMatchObject({ accessToken: 'tok-1' });
    deps.tokens.clear();
    expect(deps.tokens.get()).toBeNull();
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
    const found = findLibraryEntry(
      library({ anime: [entry('simkl-9', 'ANIME', { simkl: 9 }, { isFilm: true })] }),
      item('subject', 'ANIME', { simkl: 9 }, { isFilm: true }),
    );
    expect(found?.item.id).toBe('simkl-9');
  });

  test('a show still resolves out of the shows bucket', () => {
    const found = findLibraryEntry(
      library({ shows: [entry('simkl-7', 'TV', { simkl: 7 })] }),
      item('subject', 'TV', { simkl: 7 }),
    );
    expect(found?.item.id).toBe('simkl-7');
  });
});
