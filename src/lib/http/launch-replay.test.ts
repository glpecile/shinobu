import { expect, mock, spyOn, test } from 'bun:test';

const stored = new Map<string, string>();
let sessionChanged: (key: string) => void;
mock.module('@/state/session/tokens', () => ({
  isTokenKey: (key: string) => key === 'session.trakt',
  onSessionChange: (listener: (key: string) => void) => { sessionChanged = listener; },
}));
mock.module('react-native', () => ({ AppState: { currentState: 'active' } }));
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: () => undefined,
    set: () => {},
    remove: () => {},
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));
mock.module('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: () => ({
      getSecureString: (key: string) => stored.get(key),
      setSecureString: (key: string, value: string) => stored.set(key, value),
      removeSecureString: (key: string) => stored.delete(key),
    }),
    box: (value: unknown) => value,
  },
}));

const { endLaunchReplay, fetchWithLaunchReplay, replayFor } = await import('./launch-replay');

const anilist = (query: string) => ({ method: 'POST', body: JSON.stringify({ query, variables: {} }) });

test('only idempotent provider reads replay, keyed by their credentials', () => {
  expect(replayFor('https://api.trakt.tv/sync/watched/shows')).not.toBeNull();
  expect(replayFor('https://graphql.anilist.co', anilist('query { Viewer { id } }'))).not.toBeNull();
  expect(replayFor('https://graphql.anilist.co', anilist('\n  mutation { SaveMediaListEntry { id } }'))).toBeNull();
  expect(replayFor('https://api.trakt.tv/sync/history', { method: 'POST', body: '{}' })).toBeNull();
  // Simkl's all-items stays gated on activities in JS.
  expect(replayFor('https://api.simkl.com/sync/activities?client_id=x')).not.toBeNull();
  expect(replayFor('https://api.simkl.com/sync/all-items/shows?client_id=x')).toBeNull();
  expect(replayFor('https://letterboxd.com/glp/films/')).toBeNull();

  const url = 'https://api.trakt.tv/sync/watched/shows';
  expect(replayFor(url, { headers: { Authorization: 'Bearer a' } })!.key)
    .not.toBe(replayFor(url, { headers: { Authorization: 'Bearer b' } })!.key);
});

test('claims replay once, stops after writes, and drops pending credentials on session change', async () => {
  const timers: (() => void)[] = [];
  const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
    timers.push(callback);
    return 1;
  }) as typeof setTimeout);
  try {
    const sent: RequestInit[] = [];
    const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(init ?? {});
      return new Response('{}');
    };
    const url = 'https://api.themoviedb.org/3/movie/1';
    await fetchWithLaunchReplay(fetch, url);
    await fetchWithLaunchReplay(fetch, url);
    expect(new Headers(sent[0]!.headers).get('prefetchKey')).toBe(replayFor(url)!.key);
    expect(new Headers(sent[1]!.headers).get('prefetchKey')).toBeNull();

    const pending = Promise.withResolvers<Response>();
    const oldRead = fetchWithLaunchReplay(() => pending.promise, url, { headers: { Authorization: 'Bearer old' } });
    // Nitro's real registration yields before saving its encrypted queue.
    timers[0]!();
    sessionChanged('session.trakt');
    pending.resolve(new Response('{}'));
    await oldRead;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect([...stored.values()].flatMap((value) => JSON.parse(value))).toEqual([]);
    expect(timers).toHaveLength(1);

    endLaunchReplay();
    await fetchWithLaunchReplay(fetch, 'https://api.trakt.tv/sync/watched/shows');
    expect(new Headers(sent[2]!.headers).get('prefetchKey')).toBeNull();
  } finally {
    timer.mockRestore();
  }
});
