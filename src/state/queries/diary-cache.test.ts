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
      [...DIARY_QUERY_ROOTS.letterboxd, 'someone'],
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
    queryClient.setQueryData([...DIARY_QUERY_ROOTS.serializd, 'gian'], {
      pages: [{ entries: [diaryEntry('serializd-1396')], totalPages: 1 }],
      pageParams: [1],
    });
    // A non-diary query sharing the ['serializd'] provider root (progress → a
    // Set, no `pages`) must not break the scan.
    queryClient.setQueryData(
      ['serializd', 'progress', 'gian', 1396],
      new Set(['1-5']),
    );

    expect(findInDiaryCache(queryClient, 'serializd-1396')?.title).toBe('Perfect Blue');
  });

  // Regression: this crashed the details screen for nearly every item with
  // "Cannot read property 'id' of undefined". `DIARY_QUERY_ROOTS.letterboxd`
  // was the bare `['letterboxd']` provider root, so `getQueriesData` also
  // matched `letterboxdQueryKeys.watchlistPages` — an infinite query whose
  // pages hold `NormalizedMediaItem[]`, which have no `.item`. Latent until
  // the cross-provider gather (plan 0031 U13) began warming that key from the
  // home feed, at which point it fired on almost every details open.
  test('ignores a sibling infinite query under the same provider whose pages are media items', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([...DIARY_QUERY_ROOTS.letterboxd, 'someone'], {
      pages: [[diaryEntry('letterboxd-heat')]],
      pageParams: [1],
    });
    // The Letterboxd watchlist grid: same provider, also infinite, but its
    // pages are media items rather than diary entries.
    queryClient.setQueryData(['letterboxd', 'watchlist-pages', 'someone'], {
      pages: [[{ id: 'letterboxd-tuner', title: 'Tuner' }]],
      pageParams: [1],
    });

    expect(() => findInDiaryCache(queryClient, 'letterboxd-tuner')).not.toThrow();
    expect(findInDiaryCache(queryClient, 'letterboxd-tuner')).toBeUndefined();
    // The real diary entry still resolves with the foreign query present.
    expect(findInDiaryCache(queryClient, 'letterboxd-heat')?.title).toBe('Perfect Blue');
  });

  // Belt-and-braces to the narrowed roots: a malformed row under a genuine
  // diary key must degrade to "Not found", never throw. A resolution helper
  // that throws takes the route's ErrorBoundary with it.
  test('survives a malformed row under a real diary key', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([...DIARY_QUERY_ROOTS.trakt], {
      pages: [[undefined, {}, diaryEntry('trakt-100')]],
      pageParams: [1],
    });

    expect(findInDiaryCache(queryClient, 'trakt-100')?.title).toBe('Perfect Blue');
    expect(findInDiaryCache(queryClient, 'trakt-999')).toBeUndefined();
  });
});
