import { beforeEach, describe, expect, mock, test } from 'bun:test';

// The redirect-uri modules read Metro's `__DEV__` global at import time; bun
// doesn't define it, so pin it before anything in the graph loads.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

// react-native-mmkv is a native module that can't load under bun — back the
// session store with an in-memory Map (the state/session/serializd.test.ts
// pattern).
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
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web },
}));

// The three provider exchange boundaries are the subject's collaborators —
// recorded, never run: this suite tests the *routing*, U2's auth tests own
// the exchanges themselves.
const traktExchangeCalls: unknown[] = [];
const simklExchangeCalls: unknown[] = [];
const anilistRedirectCalls: string[] = [];
mock.module('@/state/queries/trakt', () => ({
  exchangeTraktCode: (params: unknown) => {
    traktExchangeCalls.push(params);
    return Promise.resolve({ accessToken: 'trakt-token' });
  },
}));
mock.module('@/state/queries/simkl', () => ({
  exchangeSimklCode: (params: unknown) => {
    simklExchangeCalls.push(params);
    return Promise.resolve({ accessToken: 'simkl-token' });
  },
}));
mock.module('@/state/queries/anilist', () => ({
  connectAniListFromRedirect: (url: string) => {
    anilistRedirectCalls.push(url);
    return true;
  },
}));

const { handleOAuthReturn } = await import('./use-oauth-callback');
const { setProviderClientId, setProviderClientSecret, setProviderSession } =
  await import('./tokens');

/** Minimal window stand-in: a real URL for location, a recorder for history. */
const replacedUrls: string[] = [];
function stubWindow(href: string) {
  (globalThis as { window?: unknown }).window = {
    location: new URL(href),
    history: {
      replaceState: (_state: unknown, _title: string, url: string) => {
        replacedUrls.push(url);
      },
    },
  };
}

function recordStatuses(): { statuses: string[]; setStatus: (s: string) => void } {
  const statuses: string[] = [];
  return { statuses, setStatus: (s: string) => statuses.push(s) };
}

// bun loads .env files — pin the simkl env id so tests control precedence.
const ORIGINAL_SIMKL_ENV = process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID;

beforeEach(() => {
  store.clear();
  traktExchangeCalls.length = 0;
  simklExchangeCalls.length = 0;
  anilistRedirectCalls.length = 0;
  replacedUrls.length = 0;
  process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID = ORIGINAL_SIMKL_ENV;
});

describe('handleOAuthReturn — Simkl marker routing (plan 0034 U5)', () => {
  test('a ?oauth=simkl return routes to the Simkl exchange, never Trakt', async () => {
    stubWindow('http://localhost:8081/?oauth=simkl&code=abc123&state=st-1');
    setProviderClientId('simkl', 'simkl-cid');
    const { statuses, setStatus } = recordStatuses();

    await handleOAuthReturn(setStatus);

    expect(simklExchangeCalls).toHaveLength(1);
    expect(simklExchangeCalls[0]).toMatchObject({ code: 'abc123', state: 'st-1' });
    expect(traktExchangeCalls).toHaveLength(0);
    expect(statuses).toEqual(['exchanging', 'idle']);
  });

  test('the code, state and marker are stripped from web history on consumption', async () => {
    stubWindow('http://localhost:8081/?oauth=simkl&code=abc123&state=st-1');
    setProviderClientId('simkl', 'simkl-cid');

    await handleOAuthReturn(recordStatuses().setStatus);

    expect(replacedUrls).toHaveLength(1);
    const cleaned = new URL(replacedUrls[0] ?? '');
    expect(cleaned.searchParams.get('code')).toBeNull();
    expect(cleaned.searchParams.get('state')).toBeNull();
    expect(cleaned.searchParams.get('oauth')).toBeNull();
  });

  test('an unmarked ?code= return stays on the Trakt path (backward compat)', async () => {
    stubWindow('http://localhost:8081/?code=trakt-code&state=st-2');
    setProviderClientId('trakt', 'trakt-cid');
    setProviderClientSecret('trakt', 'trakt-secret');
    const { statuses, setStatus } = recordStatuses();

    await handleOAuthReturn(setStatus);

    expect(traktExchangeCalls).toHaveLength(1);
    expect(traktExchangeCalls[0]).toMatchObject({ code: 'trakt-code' });
    expect(simklExchangeCalls).toHaveLength(0);
    expect(statuses).toEqual(['exchanging', 'idle']);
  });

  test('an already-connected Simkl skips the exchange but still consumes the code', async () => {
    stubWindow('http://localhost:8081/?oauth=simkl&code=stale&state=st-3');
    setProviderClientId('simkl', 'simkl-cid');
    setProviderSession('simkl', { accessToken: 'existing' });
    const { statuses, setStatus } = recordStatuses();

    await handleOAuthReturn(setStatus);

    expect(simklExchangeCalls).toHaveLength(0);
    expect(traktExchangeCalls).toHaveLength(0);
    expect(statuses).toEqual([]);
    // The single-use code must not survive in the address bar regardless.
    expect(replacedUrls).toHaveLength(1);
  });

  test('a marked return without a resolvable client id never exchanges', async () => {
    stubWindow('http://localhost:8081/?oauth=simkl&code=abc&state=st-4');
    delete process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID;
    const { statuses, setStatus } = recordStatuses();

    await handleOAuthReturn(setStatus);

    expect(simklExchangeCalls).toHaveLength(0);
    expect(statuses).toEqual([]);
  });

  test('a marked denial surfaces an error without touching either exchange', async () => {
    stubWindow('http://localhost:8081/?oauth=simkl&error=access_denied');
    setProviderClientId('simkl', 'simkl-cid');
    const { statuses, setStatus } = recordStatuses();

    await handleOAuthReturn(setStatus);

    expect(simklExchangeCalls).toHaveLength(0);
    expect(traktExchangeCalls).toHaveLength(0);
    expect(statuses).toEqual(['error']);
  });

  test('a bare ?oauth=simkl visit (no code, no error) is a no-op', async () => {
    stubWindow('http://localhost:8081/?oauth=simkl');
    setProviderClientId('simkl', 'simkl-cid');
    const { statuses, setStatus } = recordStatuses();

    await handleOAuthReturn(setStatus);

    expect(simklExchangeCalls).toHaveLength(0);
    expect(traktExchangeCalls).toHaveLength(0);
    expect(statuses).toEqual([]);
    expect(replacedUrls).toHaveLength(0);
  });

  test('an AniList fragment return still wins before either code path', async () => {
    stubWindow('http://localhost:8081/#access_token=tok&token_type=Bearer');
    const { statuses, setStatus } = recordStatuses();

    await handleOAuthReturn(setStatus);

    expect(anilistRedirectCalls).toHaveLength(1);
    expect(simklExchangeCalls).toHaveLength(0);
    expect(traktExchangeCalls).toHaveLength(0);
    expect(statuses).toEqual([]);
  });
});
