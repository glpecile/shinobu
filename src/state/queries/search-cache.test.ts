import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import { findInSearchCache, SEARCH_QUERY_ROOTS } from './search-cache';

function manga(id: number): NormalizedMediaItem {
  return {
    id: `anilist-${id}`,
    title: 'Vinland Saga',
    coverImage: '',
    type: 'MANGA',
    currentProgress: 0,
    progressUnit: 'chapter',
    totalEpisodes: 213,
    lastUpdated: '2026-07-25T00:00:00.000Z',
    externalIds: { anilist: id },
  };
}

function movie(id: number): NormalizedMediaItem {
  return {
    id: `trakt-${id}`,
    title: 'Motor City',
    coverImage: '',
    type: 'MOVIE',
    year: 2025,
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-25T00:00:00.000Z',
    externalIds: { trakt: id },
  };
}

describe('findInSearchCache', () => {
  // The plan 0024 U8 regression: manga is in no feed row, so the AniList
  // search cache is the *only* place the details screen can resolve it.
  test('finds a manga item under an AniList search key', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      [...SEARCH_QUERY_ROOTS.anilist, 'vinland', 20],
      [manga(30002)],
    );

    expect(findInSearchCache(queryClient, 'anilist-30002')?.type).toBe('MANGA');
  });

  test('still finds a Trakt result under the Trakt search key', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      [...SEARCH_QUERY_ROOTS.trakt, 'motor city', 10],
      [movie(7)],
    );

    expect(findInSearchCache(queryClient, 'trakt-7')?.title).toBe('Motor City');
  });

  test('scans every cached query under a root, not just the newest', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([...SEARCH_QUERY_ROOTS.anilist, 'vin', 20], [manga(1)]);
    queryClient.setQueryData(
      [...SEARCH_QUERY_ROOTS.anilist, 'vinland', 20],
      [manga(30002)],
    );

    expect(findInSearchCache(queryClient, 'anilist-1')).toBeDefined();
    expect(findInSearchCache(queryClient, 'anilist-30002')).toBeDefined();
  });

  test('misses cleanly on a cold deep link', () => {
    expect(findInSearchCache(new QueryClient(), 'anilist-999')).toBeUndefined();
  });
});
