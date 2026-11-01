import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { QueryClient, QueryObserver, type QueryObserverResult } from '@tanstack/react-query';

// The graph reaches modules that read Metro's `__DEV__` global at import time.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

// react-native-mmkv backs both the session store and Simkl's per-flow PKCE
// storage — one in-memory Map serves both instances under bun. Writes notify
// listeners the way MMKV does in-process, for `syncQueryCacheWithSessions`.
const store = new Map<string, string>();
const listeners = new Set<(key: string) => void>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => {
      store.set(key, value);
      for (const listener of listeners) listener(key);
    },
    remove: (key: string) => {
      store.delete(key);
      for (const listener of listeners) listener(key);
    },
    getAllKeys: () => [...store.keys()],
    addOnValueChangedListener: (listener: (key: string) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  }),
}));
// The platform http client can't load under bun; requests are recorded instead.
const requested: string[] = [];
mock.module('@/lib/http/client', () => ({
  httpFetch: async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return Response.json([]);
  },
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

const { disconnectProvider, syncQueryCacheWithSessions } = await import('./index');
const {
  clearProviderSession,
  getProviderSession,
  setProviderClientId,
  setProviderClientSecret,
  setProviderSession,
} = await import('./tokens');
const { watchlistOptions } = await import('@/state/queries/watchlist');
const { upNextOptions } = await import('@/state/queries/up-next');
const { getSimklAuthFlow, saveSimklAuthFlow } = await import(
  '@/lib/providers/simkl/auth'
);
const { simklQueryKeys } = await import('@/state/queries/simkl');
const { DIARY_QUERY_ROOT } = await import('@/state/queries/diary-pages');
const { UP_NEXT_QUERY_ROOT } = await import('@/state/queries/up-next-cache');
const { WATCHLIST_QUERY_ROOT } = await import('@/state/queries/watchlist-cache');

beforeEach(() => {
  store.clear();
  listeners.clear();
  requested.length = 0;
});

describe('disconnectProvider — Simkl (plan 0034 U5)', () => {
  test("clears the token, every ['simkl']-rooted query and the merged caches", () => {
    setProviderSession('simkl', { accessToken: 'tok-1' });
    const queryClient = new QueryClient();
    queryClient.setQueryData(simklQueryKeys.userSettings(), {
      username: 'gian',
    });
    queryClient.setQueryData(simklQueryKeys.allItems(), { shows: [] });
    queryClient.setQueryData(['trakt', 'viewer'], 'unrelated');
    // All three hold every provider's rows under a key naming none of them, so the
    // per-provider purge can't reach them.
    const watchlistKey = [...WATCHLIST_QUERY_ROOT, 'inputs'];
    const upNextKey = [...UP_NEXT_QUERY_ROOT, 'inputs'];
    queryClient.setQueryData(watchlistKey, { inputs: [], errors: [] });
    queryClient.setQueryData(upNextKey, { progress: [] });
    const diaryKey = [...DIARY_QUERY_ROOT, 'feed', 'simkl,trakt', '', ''];
    queryClient.setQueryData(diaryKey, { pages: [], pageParams: [] });

    disconnectProvider(queryClient, 'simkl');

    expect(getProviderSession('simkl')).toBeNull();
    expect(queryClient.getQueryData(simklQueryKeys.userSettings())).toBeUndefined();
    expect(queryClient.getQueryData(simklQueryKeys.allItems())).toBeUndefined();
    expect(queryClient.getQueryData(watchlistKey)).toBeUndefined();
    expect(queryClient.getQueryData(upNextKey)).toBeUndefined();
    expect(queryClient.getQueryData(diaryKey)).toBeUndefined();
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

describe('syncQueryCacheWithSessions', () => {
  test('a session cleared outside Disconnect purges like one', () => {
    setProviderSession('anilist', { accessToken: 'a' });
    const queryClient = new QueryClient();
    const upNextKey = [...UP_NEXT_QUERY_ROOT, 'inputs'];
    queryClient.setQueryData(['anilist', 'viewer'], 1);
    queryClient.setQueryData(upNextKey, { progress: [] });
    const unsubscribe = syncQueryCacheWithSessions(queryClient);

    // What the transport's `tokens.clear()` does on a dead token.
    clearProviderSession('anilist');

    expect(queryClient.getQueryData(['anilist', 'viewer'])).toBeUndefined();
    expect(queryClient.getQueryData(upNextKey)).toBeUndefined();
    unsubscribe();
  });

  test.each([
    ['watchlist', watchlistOptions],
    ['up-next', upNextOptions],
  ] as const)('a new connect refetches the active %s gather with that provider; a token refresh does not', async (_, options) => {
    // Session reads are client-only (`currentUsableProviders`).
    (globalThis as { window?: unknown }).window = {};
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const unsubscribe = syncQueryCacheWithSessions(queryClient);
    const observer = new QueryObserver<unknown>(queryClient, options(queryClient));
    const idle = () =>
      new Promise<QueryObserverResult>((resolve) => {
        const stop = observer.subscribe((result) => {
          if (result.fetchStatus === 'idle') {
            stop();
            resolve(result);
          }
        });
      });
    const stopObserving = observer.subscribe(() => {});
    await idle();

    setProviderClientId('trakt', 'cid');
    setProviderClientSecret('trakt', 'secret');
    setProviderSession('trakt', { accessToken: 't-1' });
    await idle();
    expect(requested.some((url) => url.startsWith('https://api.trakt.tv/'))).toBe(true);

    requested.length = 0;
    setProviderSession('trakt', { accessToken: 't-2' });
    expect(observer.getCurrentResult().fetchStatus).toBe('idle');
    expect(requested).toEqual([]);
    stopObserving();
    unsubscribe();
    queryClient.clear();
    delete (globalThis as { window?: unknown }).window;
  });
});
