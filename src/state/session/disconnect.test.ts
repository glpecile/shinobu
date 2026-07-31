import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

// The graph reaches modules that read Metro's `__DEV__` global at import time.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

// react-native-mmkv backs both the session store and Simkl's per-flow PKCE
// storage — one in-memory Map serves both instances under bun.
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
// The simkl query layer imports the platform http client, which can't load
// under bun — nothing here goes near the network.
mock.module('@/lib/http/client', () => ({
  httpFetch: async () => new Response('{}'),
}));
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web },
}));
// simkl/auth.ts imports expo-crypto at module load — mirror the surface it
// consumes (lib/providers/simkl/auth.test.ts pattern); nothing here digests.
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

const { disconnectProvider } = await import('./index');
const { getProviderSession, setProviderSession } = await import('./tokens');
const { getSimklAuthFlow, saveSimklAuthFlow } = await import(
  '@/lib/providers/simkl/auth'
);
const { simklQueryKeys } = await import('@/state/queries/simkl');

beforeEach(() => store.clear());

describe('disconnectProvider — Simkl (plan 0034 U5)', () => {
  test("clears the token and removes every ['simkl']-rooted query", () => {
    setProviderSession('simkl', { accessToken: 'tok-1' });
    const queryClient = new QueryClient();
    queryClient.setQueryData(simklQueryKeys.userSettings(), {
      username: 'gian',
    });
    queryClient.setQueryData(simklQueryKeys.allItems(), { shows: [] });
    queryClient.setQueryData(['trakt', 'viewer'], 'unrelated');

    disconnectProvider(queryClient, 'simkl');

    expect(getProviderSession('simkl')).toBeNull();
    expect(queryClient.getQueryData(simklQueryKeys.userSettings())).toBeUndefined();
    expect(queryClient.getQueryData(simklQueryKeys.allItems())).toBeUndefined();
    // Another provider's cache must survive a Simkl disconnect untouched.
    expect(queryClient.getQueryData(['trakt', 'viewer'])).toBe(
      'unrelated' as never,
    );
  });

  test('drops a pending PKCE flow with the session', () => {
    setProviderSession('simkl', { accessToken: 'tok-1' });
    saveSimklAuthFlow({ verifier: 'v'.repeat(64), state: 's'.repeat(32) });

    disconnectProvider(new QueryClient(), 'simkl');

    expect(getSimklAuthFlow()).toBeNull();
  });

  test('a non-simkl disconnect leaves a pending Simkl flow alone', () => {
    setProviderSession('trakt', { accessToken: 'tok-t' });
    saveSimklAuthFlow({ verifier: 'v'.repeat(64), state: 's'.repeat(32) });

    disconnectProvider(new QueryClient(), 'trakt');

    expect(getSimklAuthFlow()).not.toBeNull();
    expect(getProviderSession('trakt')).toBeNull();
  });
});
