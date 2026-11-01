import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

GlobalRegistrator.register();
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { renderHook, waitFor } = await import('@testing-library/react');
const store = new Map<string, string>();
mock.module('react-native-mmkv', () => ({ createMMKV: () => ({
  getString: (key: string) => store.get(key),
  set: (key: string, value: string) => store.set(key, value),
  remove: (key: string) => store.delete(key),
  getAllKeys: () => [...store.keys()],
  addOnValueChangedListener: () => ({ remove() {} }),
}) }));
mock.module('react-native', () => ({ Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web } }));
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));
let providers: ProviderId[] = [];
mock.module('@/state/session', () => ({
  useConnectedProviders: () => providers,
  currentUsableProviders: () => providers,
}));
let urls: string[] = [];
mock.module('@/lib/http/client', () => ({ httpFetch: (url: string) => {
  urls.push(String(url));
  // Cold paths stay pending, so every case is deterministic.
  return new Promise<Response>(() => {});
} }));

const { useResolvedMediaItem } = await import('./resolve-item');
const { UP_NEXT_QUERY_ROOT } = await import('./up-next-cache');
const { setProviderClientId } = await import('@/state/session/tokens');
const { clearTmdbToken, saveTmdbToken } = await import('@/state/session/tmdb-token');

const show: NormalizedMediaItem = { id: 'trakt-42', title: 'Frieren', type: 'TV', coverImage: '',
  currentProgress: 3, progressUnit: 'episode', lastUpdated: '', externalIds: { trakt: 42 } };

// clearTmdbToken also drops the module's resolved-token cache, which store.clear() can't reach.
beforeEach(() => { store.clear(); clearTmdbToken(); providers = []; urls = []; });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

function seedUpNext() {
  const { client, wrapper } = setup();
  client.setQueryData([...UP_NEXT_QUERY_ROOT, 'inputs'], { progress: [{ item: show }] });
  return wrapper;
}

test('a card cached by Up Next resolves without a request', () => {
  const wrapper = seedUpNext();
  const { result } = renderHook(() => useResolvedMediaItem('trakt-42'), { wrapper });
  expect(result.current.item?.id).toBe('trakt-42');
  expect(result.current.isLoading).toBe(false);
  expect(urls).toEqual([]);
});

test('a cached item of another type does not resolve', () => {
  setProviderClientId('trakt', 'byo-cid');
  const wrapper = seedUpNext();
  const { result } = renderHook(() => useResolvedMediaItem('trakt-42', 'MOVIE'), { wrapper });
  expect(result.current.item).toBeUndefined();
  // The gate drops the cached TV twin, so the typed Trakt movie lookup runs and stays pending.
  expect(result.current.isLoading).toBe(true);
});

test('an unknown id with nothing cached is not found', () => {
  const { wrapper } = setup();
  const { result } = renderHook(() => useResolvedMediaItem('nothing-1'), { wrapper });
  expect(result.current.item).toBeUndefined();
  expect(result.current.isLoading).toBe(false);
});

test('a cold TMDB link loads while its details are in flight', async () => {
  // Without a token the details read has no TMDB leg and settles as not found.
  saveTmdbToken('tmdb-token');
  const { wrapper } = setup();
  const { result } = renderHook(() => useResolvedMediaItem('tmdb-movie-603'), { wrapper });
  await waitFor(() => expect(urls.some((url) => url.includes('themoviedb.org/3/movie/603'))).toBe(true));
  expect(result.current.item).toBeUndefined();
  expect(result.current.isLoading).toBe(true);
});
