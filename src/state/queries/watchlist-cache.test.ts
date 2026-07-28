import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import { findInWatchlistCache, WATCHLIST_QUERY_ROOT } from './watchlist-cache';

function film(id: string, title: string): NormalizedMediaItem {
  return {
    id,
    title,
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    year: 1995,
    lastUpdated: '2026-07-20T00:00:00.000Z',
    externalIds: { tmdb: 949 },
  };
}

/** The gather's cached value, exactly as `fetchWatchlistInputs` returns it. */
function seed(): QueryClient {
  const client = new QueryClient();
  client.setQueryData([...WATCHLIST_QUERY_ROOT, 'inputs'], {
    inputs: [
      { item: film('trakt-1', 'Heat'), source: 'trakt', addedAt: '2026-07-20' },
      // Same film, the other provider's copy — the merge's precedence winner is
      // the Trakt row above, and this one must still resolve.
      { item: film('letterboxd-heat', 'Heat'), source: 'letterboxd' },
      { item: film('anilist-5', 'Perfect Blue'), source: 'anilist' },
    ],
    errors: [],
  });
  return client;
}

describe('findInWatchlistCache (plan 0031 U14)', () => {
  test('resolves a Trakt-sourced watchlist item that belongs to no feed slot', () => {
    // The regression it exists for: after R25 the merged row carries Trakt and
    // AniList items, and anything the details chain cannot resolve renders
    // "Not found".
    expect(findInWatchlistCache(seed(), 'trakt-1')?.title).toBe('Heat');
    expect(findInWatchlistCache(seed(), 'anilist-5')?.title).toBe('Perfect Blue');
  });

  test('resolves a contributing item, not just the merge precedence winner', () => {
    // Manage Trackers' hidden list links by the *stored* id, which can be the
    // Letterboxd twin of a row the merge renders from Trakt.
    expect(findInWatchlistCache(seed(), 'letterboxd-heat')?.title).toBe('Heat');
  });

  test('a cold cache resolves nothing and asks for nothing', () => {
    expect(findInWatchlistCache(new QueryClient(), 'trakt-1')).toBeUndefined();
  });

  test('an unknown id is undefined rather than the first row', () => {
    expect(findInWatchlistCache(seed(), 'trakt-999')).toBeUndefined();
  });
});
