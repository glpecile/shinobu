import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedDiaryEntry, NormalizedMediaItem } from '@/types/media';

GlobalRegistrator.register();
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { act, renderHook, waitFor } = await import('@testing-library/react');
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
mock.module('@/state/session', () => ({ useConnectedProviders: () => providers }));
let transport: (url: string, init?: RequestInit) => Promise<Response>;
mock.module('@/lib/http/client', () => ({ httpFetch: (url: string, init?: RequestInit) => transport(String(url), init) }));

const { useDiaryFeedQuery, useFilmPlaysQuery } = await import('./use-diary-feed');
const { diaryQueryKeys } = await import('./diary-pages');
const { setProviderSession, setProviderClientId } = await import('@/state/session/tokens');
const { invalidateAfterLog } = await import('@/features/log-media/use-log-media');

const film = { id: 'letterboxd-perfect-blue', title: 'Perfect Blue', type: 'MOVIE' as const,
  coverImage: '', currentProgress: 0, progressUnit: 'episode' as const,
  lastUpdated: '', externalIds: { letterboxd: 'perfect-blue', tmdb: 10494 } };
const entry: NormalizedDiaryEntry = { id: 'trakt-1', provider: 'trakt',
  watchedAt: '2026-10-20T12:00:00Z', item: film };
const rss = '<rss><channel><item><guid>watch-1</guid><link>https://letterboxd.com/film/perfect-blue/</link><letterboxd:filmTitle>Perfect Blue</letterboxd:filmTitle><letterboxd:watchedDate>2026-10-20</letterboxd:watchedDate><tmdb:movieId>10494</tmdb:movieId></item></channel></rss>';

beforeEach(() => { store.clear(); providers = []; });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

test('diary and film plays share RSS, refresh after logging, and separate accounts', async () => {
  providers = ['letterboxd'];
  setProviderSession('letterboxd', { accessToken: '', username: 'first' });
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  transport = async () => { requests++; await pending; return new Response(rss); };
  const { client, wrapper } = setup();
  const read = renderHook(() => ({ diary: useDiaryFeedQuery(), plays: useFilmPlaysQuery(film) }), { wrapper });
  try {
    await waitFor(() => expect(requests).toBe(1));
    await act(async () => { release(); });
    await waitFor(() => {
      expect(read.result.current.diary.entryCount).toBe(1);
      expect(read.result.current.plays.data).toHaveLength(1);
    });
    expect(requests).toBe(1);
    let releaseOld!: () => void;
    let aborted = false;
    transport = async (_url, init) => {
      requests++;
      if (requests === 2) {
        init?.signal?.addEventListener('abort', () => { aborted = true; });
        await new Promise<void>((resolve) => { releaseOld = resolve; });
        return new Response('<rss><channel></channel></rss>');
      }
      return new Response(rss);
    };
    let refreshed!: Promise<unknown>;
    act(() => { refreshed = read.result.current.diary.refetch(); });
    await waitFor(() => expect(requests).toBe(2));
    await act(async () => { invalidateAfterLog(client, film, ['letterboxd']); });
    await waitFor(() => expect(requests).toBe(3));
    expect(aborted).toBe(true);
    await act(async () => { releaseOld(); await refreshed; });
    await waitFor(() => expect(read.result.current.diary.entryCount).toBe(1));
    await act(async () => {
      setProviderSession('letterboxd', { accessToken: '', username: 'second' });
      read.rerender();
    });
    await waitFor(() => expect(requests).toBe(4));
  } finally { read.unmount(); client.clear(); }
});

test('logging during the first diary load starts a post-write RSS read', async () => {
  providers = ['letterboxd'];
  setProviderSession('letterboxd', { accessToken: '', username: 'first' });
  let requests = 0;
  let releaseOld!: () => void;
  transport = async () => {
    requests++;
    if (requests === 1) {
      await new Promise<void>((resolve) => { releaseOld = resolve; });
      return new Response('<rss><channel></channel></rss>');
    }
    return new Response(rss);
  };
  const { client, wrapper } = setup();
  const read = renderHook(() => useDiaryFeedQuery(), { wrapper });
  try {
    await waitFor(() => expect(requests).toBe(1));
    await act(async () => { invalidateAfterLog(client, film, ['letterboxd']); });
    await waitFor(() => expect(requests).toBe(2));
    await act(async () => { releaseOld(); });
    await waitFor(() => expect(read.result.current.entryCount).toBe(1));
  } finally { read.unmount(); client.clear(); }
});

test('repeated pagination shares a page request and does not cancel refresh', async () => {
  providers = ['trakt'];
  setProviderSession('trakt', { accessToken: 'test' });
  setProviderClientId('trakt', 'test');
  const { client, wrapper } = setup();
  client.setQueryData(diaryQueryKeys.feed(['trakt'], '', ''), {
    pages: [{ slices: { trakt: { entries: [entry], next: 2 } } }], pageParams: [{ trakt: 1 }],
  });
  let requests = 0;
  let aborted = 0;
  let release!: () => void;
  transport = (_url, init) => {
    requests++;
    init?.signal?.addEventListener('abort', () => { aborted++; });
    return new Promise((resolve) => { release = () => resolve(Response.json([])); });
  };
  const read = renderHook(() => useDiaryFeedQuery(), { wrapper });
  try {
    act(() => { read.result.current.fetchNextPage(); read.result.current.fetchNextPage(); });
    await waitFor(() => expect(requests).toBe(1));
    await act(async () => { release(); });
    await waitFor(() => expect(read.result.current.isFetchingNextPage).toBe(false));
    expect(aborted).toBe(0);
    let refreshed!: Promise<unknown>;
    act(() => { refreshed = read.result.current.refetch(); });
    await waitFor(() => expect(requests).toBe(2));
    act(() => { read.result.current.fetchNextPage(); });
    expect(aborted).toBe(0);
    expect(requests).toBe(2);
    await act(async () => { release(); await refreshed; });
  } finally { read.unmount(); client.clear(); }
});

test('film plays keep their fetch when the catalogue merge adds an IMDb id', async () => {
  providers = ['trakt'];
  setProviderSession('trakt', { accessToken: 'test' });
  setProviderClientId('trakt', 'test');
  let requests = 0;
  transport = async () => { requests++; return Response.json([]); };
  const { client, wrapper } = setup();
  const traktFilm: NormalizedMediaItem = { ...film, externalIds: { trakt: 1, tmdb: 10494 } };
  const read = renderHook(({ item }) => useFilmPlaysQuery(item), { wrapper, initialProps: { item: traktFilm } });
  try {
    await waitFor(() => expect(read.result.current.isSuccess).toBe(true));
    read.rerender({ item: { ...traktFilm, externalIds: { ...traktFilm.externalIds, imdb: 'tt0156887' } } });
    expect(read.result.current.isFetching).toBe(false);
    expect(requests).toBe(1);
  } finally { read.unmount(); client.clear(); }
});
