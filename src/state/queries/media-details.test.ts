import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * `state/queries/media-details.ts` passes its Trakt leg only when Trakt has a
 * usable client id (plan 0034 KTD-8) — `getClientIdForProvider('trakt') !==
 * ''`, the same gate `mapping.ts` uses. `buildMediaDetailsDeps` is the
 * extracted, React-free function that decides this — tested directly here,
 * the same way `mapping.test.ts` pins its credential gates.
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
mock.module('@/lib/http/client', () => ({
  httpFetch: async () => new Response('{}'),
}));
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web },
}));
// `./media-details` imports `./mapping` (its ani.zip/TMDB-id helpers), which
// imports `./simkl`, whose auth re-export reaches expo-crypto — mirror the
// surface it consumes instead of loading the whole expo package under bun
// (the `state/queries/simkl.test.ts` pattern).
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

const { buildMediaDetailsDeps } = await import('./media-details');
const { setProviderClientId, clearProviderClientId } = await import(
  '@/state/session/tokens'
);

const ORIGINAL_TRAKT_ENV = process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID;

beforeEach(() => {
  store.clear();
  clearProviderClientId('trakt');
});

afterAll(() => {
  process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = ORIGINAL_TRAKT_ENV;
});

describe('buildMediaDetailsDeps Trakt leg (plan 0034 KTD-8)', () => {
  test('is a real TraktDeps when a BYO Trakt client id is stored', () => {
    setProviderClientId('trakt', 'byo-cid');

    expect(buildMediaDetailsDeps().trakt).not.toBeNull();
  });

  test('is null when no BYO client id is stored', () => {
    expect(buildMediaDetailsDeps().trakt).toBeNull();
  });

  test('EXPO_PUBLIC_TRAKT_CLIENT_ID no longer counts as credentials (plan 0034 R12)', () => {
    process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID = 'env-cid';

    expect(buildMediaDetailsDeps().trakt).toBeNull();
  });
});
