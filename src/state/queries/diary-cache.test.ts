import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { NormalizedDiaryEntry } from '@/types/media';
import { DIARY_QUERY_ROOTS, findInDiaryCache } from './diary-cache';

function diaryEntry(itemId: string): NormalizedDiaryEntry {
  return {
    id: `trakt-log-${itemId}`,
    provider: 'trakt',
    watchedAt: '2026-07-20T18:30:00.000Z',
    item: {
      id: itemId,
      title: 'Perfect Blue',
      coverImage: '',
      type: 'MOVIE',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: '2026-07-20T18:30:00.000Z',
      externalIds: { trakt: 100 },
    },
  };
}

describe('findInDiaryCache', () => {
  test('returns the embedded item when its id is in a cached diary page', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([...DIARY_QUERY_ROOTS.trakt], {
      pages: [[diaryEntry('trakt-100')]],
      pageParams: [1],
    });

    expect(findInDiaryCache(queryClient, 'trakt-100')?.title).toBe('Perfect Blue');
  });

  test('finds an item under the letterboxd (username-suffixed) diary key', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      [...DIARY_QUERY_ROOTS.letterboxd, 'diary', 'someone'],
      { pages: [[diaryEntry('letterboxd-heat')]], pageParams: [1] },
    );

    expect(findInDiaryCache(queryClient, 'letterboxd-heat')?.title).toBe('Perfect Blue');
  });

  test('returns undefined for an id in no cached diary page', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([...DIARY_QUERY_ROOTS.trakt], {
      pages: [[diaryEntry('trakt-100')]],
      pageParams: [1],
    });

    expect(findInDiaryCache(queryClient, 'trakt-999')).toBeUndefined();
  });

  test('scans the serializd root whose pages are { entries, totalPages } objects', () => {
    const queryClient = new QueryClient();
    // Serializd's infinite pages differ in shape from the flat-array providers.
    queryClient.setQueryData([...DIARY_QUERY_ROOTS.serializd, 'diary', 'gian'], {
      pages: [{ entries: [diaryEntry('serializd-1396')], totalPages: 1 }],
      pageParams: [1],
    });
    // A non-diary query sharing the ['serializd'] root (progress → a Set, no
    // `pages`) must not break the scan.
    queryClient.setQueryData(
      [...DIARY_QUERY_ROOTS.serializd, 'progress', 'gian', 1396],
      new Set(['1-5']),
    );

    expect(findInDiaryCache(queryClient, 'serializd-1396')?.title).toBe('Perfect Blue');
  });
});
