import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedDiaryEntry } from '@/types/media';
import {
  DIARY_QUERY_ROOT,
  diaryStates,
  findInDiaryCache,
  nextDiaryCursor,
  type DiaryPage,
} from './diary-pages';

function diaryEntry(itemId: string, provider: ProviderId = 'trakt', watchedAt = '2026-07-20T18:30:00.000Z'): NormalizedDiaryEntry {
  return {
    id: `${provider}-log-${itemId}`,
    provider,
    watchedAt,
    item: {
      id: itemId,
      title: 'Perfect Blue',
      coverImage: '',
      type: 'MOVIE',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: watchedAt,
      externalIds: { trakt: 100 },
    },
  };
}

describe('nextDiaryCursor', () => {
  test('advances only the watermark provider, at its own next page', () => {
    const pages: DiaryPage[] = [
      {
        slices: {
          // Trakt's oldest loaded (Jul 10) is newer than Simkl's (Jul 1) and it
          // has more pages — it defines the cut and must advance.
          trakt: { entries: [diaryEntry('a', 'trakt', '2026-07-10T00:00:00Z')], next: 2 },
          simkl: { entries: [diaryEntry('b', 'simkl', '2026-07-01T00:00:00Z')], next: undefined },
        },
      },
    ];
    expect(nextDiaryCursor(pages)).toEqual({ trakt: 2 });
  });

  test('is undefined once nobody has more pages', () => {
    expect(nextDiaryCursor([{ slices: { simkl: { entries: [], next: undefined } } }])).toBeUndefined();
  });
});

describe('diaryStates', () => {
  test('a provider whose first fetch failed drops out of the watermark', () => {
    const [state] = diaryStates([
      { slices: { anilist: { entries: [], next: 1, error: 'boom' } } },
    ]);
    expect(state).toMatchObject({ provider: 'anilist', failed: true, hasMore: false, error: 'boom' });
  });

  test('a failed later page keeps the entries and retries that page', () => {
    const pages: DiaryPage[] = [
      { slices: { trakt: { entries: [diaryEntry('a')], next: 2 } } },
      { slices: { trakt: { entries: [], next: 2, error: 'boom' } } },
    ];
    const [state] = diaryStates(pages);
    expect(state.entries).toHaveLength(1);
    expect(state).toMatchObject({ failed: false, hasMore: true, error: 'boom' });
    expect(nextDiaryCursor(pages)).toEqual({ trakt: 2 });
  });
});

function cache(entries: unknown[]): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData([...DIARY_QUERY_ROOT, 'trakt', '', ''], {
    pages: [{ slices: { trakt: { entries, next: undefined } } }],
    pageParams: [{ trakt: 1 }],
  });
  return queryClient;
}

describe('findInDiaryCache', () => {
  test('returns the embedded item when its id is in a cached diary page', () => {
    expect(findInDiaryCache(cache([diaryEntry('trakt-100')]), 'trakt-100')?.title).toBe('Perfect Blue');
  });

  test('returns undefined for an id in no cached diary page', () => {
    expect(findInDiaryCache(cache([diaryEntry('trakt-100')]), 'trakt-999')).toBeUndefined();
  });

  // Belt-and-braces: a malformed row under the diary key must degrade to
  // "Not found", never throw — a resolution helper that throws takes the
  // route's ErrorBoundary with it.
  test('survives a malformed row', () => {
    const queryClient = cache([undefined, {}, diaryEntry('trakt-100')]);
    expect(findInDiaryCache(queryClient, 'trakt-100')?.title).toBe('Perfect Blue');
    expect(findInDiaryCache(queryClient, 'trakt-999')).toBeUndefined();
  });
});
