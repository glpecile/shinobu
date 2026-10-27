import { expect, mock, test } from 'bun:test';

mock.module('react-native', () => ({ AppState: { currentState: 'background' } }));
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: () => undefined,
    set: () => {},
    remove: () => {},
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));
mock.module('react-native-nitro-modules', () => ({
  NitroModules: { createHybridObject: () => ({}), box: (value: unknown) => value },
}));

const { fetchWithLaunchReplay, replayFor } = await import('./launch-replay');

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

test('a session claims each launch replay once', async () => {
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
});
