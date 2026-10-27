import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { describe, expect, mock, test } from 'bun:test';
import { createElement, Suspense, type ReactNode } from 'react';

import { computeUpNext } from '@/features/up-next/compute';
import type { AniListCurrentEntry } from '@/lib/providers/anilist/normalize';

GlobalRegistrator.register();
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { act, renderHook, waitFor } = await import('@testing-library/react');

// Import-time stubs only: MMKV, the native fetch client and react-native's
// entry point don't load under bun. Provider reads use the stub transport;
// the watchlist selector reads seeded query data.
const store = new Map<string, string>();
const listeners = new Set<() => void>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => { store.set(key, value); for (const listener of listeners) listener(); },
    remove: (key: string) => { store.delete(key); for (const listener of listeners) listener(); },
    getAllKeys: () => [...store.keys()],
    addOnValueChangedListener: (listener: () => void) => { listeners.add(listener); return { remove: () => listeners.delete(listener) }; },
  }),
}));
let requests = 0;
let failureStatus: number | undefined;
let progressOverride: number | undefined;
mock.module('@/lib/http/client', () => ({
  httpFetch: async (_url: string, init: RequestInit) => {
    requests++;
    if (failureStatus != null) return new Response('{}', { status: failureStatus });
    if (JSON.parse(String(init.body)).query.includes('Page(page:')) return Response.json({ data: { Page: {
      pageInfo: { hasNextPage: false }, media: Array.from({ length: 50 }, (_, i) => ({ id: i + 1, type: 'ANIME' })),
    } } });
    return new Response(JSON.stringify({ data: { Media: {
      id: 1, type: 'ANIME', title: { romaji: 'Title' }, description: 'Full synopsis',
      mediaListEntry: { id: 100, status: 'CURRENT', progress: progressOverride ?? (new Headers(init.headers).get('Authorization') === 'Bearer second' ? 2 : 1) },
      episodes: 1,
      duration: 24,
      airingSchedule: { edges: [] },
      streamingEpisodes: [],
      relations: { edges: [{ relationType: 'SEQUEL', node: { id: 2, type: 'ANIME', title: { romaji: 'Sequel' } } }] },
    } } }));
  },
}));
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web },
}));

const { anilistQueryKeys, fetchWatchlistAnime, useAniListEpisodesQuery, useSuspenseAniListRelationsQuery, useAnimeByIdQuery, useAniListEntryStateQuery, useSuspenseSeasonalAnimePagesQuery } = await import('./anilist');
const { setProviderSession, clearProviderSession } = await import('@/state/session/tokens');
const { createQueryClient } = await import('./query-client');

test('the episode read does not multiply the combined query’s retry budget', async () => {
  requests = 0;
  failureStatus = 503;
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const read = renderHook(() => useAniListEpisodesQuery({ mediaId: 1 }), { wrapper });
  try {
    await waitFor(() => expect(read.result.current.isError).toBe(true));
    expect(requests).toBe(4);
  } finally {
    read.unmount();
    client.clear();
    failureStatus = undefined;
  }
});

test('metadata, progress, episodes and relations share a request and revalidate for a new account', async () => {
  requests = 0;
  setProviderSession('anilist', { accessToken: 'first' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(
    QueryClientProvider, { client }, createElement(Suspense, { fallback: null }, children),
  );
  const episodes = renderHook(() => useAniListEpisodesQuery({ mediaId: 1 }).data, { wrapper });
  const relations = renderHook(() => useSuspenseAniListRelationsQuery({ mediaId: 1, type: 'ANIME' }).data, { wrapper });
  const metadata = renderHook(() => useAnimeByIdQuery(1), { wrapper });
  const progress = renderHook(() => useAniListEntryStateQuery({ mediaId: 1 }), { wrapper });
  await waitFor(() => expect(episodes.result.current?.episodes).toHaveLength(1));
  await waitFor(() => expect(relations.result.current?.relations[0].item.id).toBe('anilist-2'));
  expect(requests).toBe(1);
  await waitFor(() => expect(metadata.result.current.data?.overview).toBe('Full synopsis'));
  await waitFor(() => expect(progress.result.current.data?.entry?.progress).toBe(1));
  await act(async () => { setProviderSession('anilist', { accessToken: 'second' }); });
  await waitFor(() => expect(progress.result.current.data?.entry?.progress).toBe(2));
  await waitFor(() => expect(relations.result.current?.entryState?.entry?.progress).toBe(2));
  expect(requests).toBe(2);
  progressOverride = 3;
  await act(async () => { await client.invalidateQueries({ queryKey: anilistQueryKeys.relations(1) }); });
  await waitFor(() => expect(progress.result.current.data?.entry?.progress).toBe(3));
  expect(client.getQueryData<{ entry: { progress: number } }>(anilistQueryKeys.entryState(1))?.entry.progress).toBe(3);
  expect(requests).toBe(3);
  metadata.unmount();
  progress.unmount();
  episodes.unmount();
  relations.unmount();
  const revisit = renderHook(() => useAniListEpisodesQuery({ mediaId: 1 }).data, { wrapper });
  await waitFor(() => expect(revisit.result.current?.episodes).toHaveLength(1));
  expect(requests).toBe(3);
  revisit.unmount();
  client.clear();
  clearProviderSession('anilist');
  progressOverride = undefined;
});

test('seasonal pagination uses the server flag and reuses Home’s cached first page', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const window = { season: 'WINTER' as const, year: 2027 };
  client.setQueryData(anilistQueryKeys.seasonalAnime(window, 'TV'), { items: [], hasNextPage: true });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, createElement(Suspense, { fallback: null }, children));
  requests = 0;
  const pages = renderHook(() => useSuspenseSeasonalAnimePagesQuery(window, 'TV'), { wrapper });
  await waitFor(() => expect(pages.result.current.hasNextPage).toBe(true));
  expect(requests).toBe(0);
  await pages.result.current.fetchNextPage();
  await waitFor(() => expect(pages.result.current.hasNextPage).toBe(false));
  expect(requests).toBe(1);
  pages.unmount();
  client.clear();
});

function entry(
  anilistId: number,
  status: AniListCurrentEntry['status'],
): AniListCurrentEntry {
  return {
    entryId: anilistId * 100,
    item: {
      id: `anilist-${anilistId}`,
      title: `Anime ${anilistId}`,
      coverImage: '',
      type: 'ANIME',
      currentProgress: status === 'CURRENT' ? 3 : 0,
      progressUnit: 'episode',
      lastUpdated: '2026-07-21T00:00:00.000Z',
      externalIds: { anilist: anilistId },
    },
    status,
    nextAiring: null,
    totalEpisodes: 12,
  };
}

/**
 * The regression gate (plan 0031 R28, widened by plan 0035 R2), naming
 * `docs/solutions/anilist-shared-list-query-status-gate.md` on purpose: one
 * request carries both statuses, and every consumer takes a *slice*. A future
 * "simplification" that deletes `compute.ts`'s PLANNING gate on the grounds
 * that plan-to-watch is displayed now anyway floods Continue
 * Watching with the user's whole backlog. This test is what fails first.
 */
describe('the PLANNING gate (anilist-shared-list-query-status-gate.md)', () => {
  test('a mid-run PLANNING entry reaches the watchlist and nowhere in Up Next', async () => {
    // Mid-run: five episodes have already aired, progress is 0, the next airing
    // is in the past. Exactly the shape that classifies as `aired` and pours
    // into Continue Watching without the gate.
    const NOW = new Date(2026, 6, 23, 20, 0);
    const planning: AniListCurrentEntry = {
      ...entry(42, 'PLANNING'),
      nextAiring: {
        episode: 6,
        airingAt: new Date(2026, 6, 22, 20, 0).toISOString(),
      },
    };
    const client = new QueryClient();
    client.setQueryData(anilistQueryKeys.currentAnimeEntries(), [planning]);

    // 1. The watchlist surface sees it.
    expect((await fetchWatchlistAnime(client)).map((e) => e.item.id)).toEqual([
      'anilist-42',
    ]);

    // 2. Neither Up Next section does — not Continue Watching (it is not
    //    "aired, waiting, one tap away"; nothing has been started) and not
    //    Calendar (episode 6 already aired, so there is no event this week).
    const upNext = computeUpNext(
      {
        progress: [],
        calendar: [],
        releases: [],
        anilist: [planning],
        errors: [],
      },
      NOW,
    );
    expect(upNext.continueWatching).toEqual([]);
    expect(upNext.calendar).toEqual([]);
  });
});
