import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import { findInWatchlistCache, findLetterboxdTwinInCache, WATCHLIST_QUERY_ROOT } from './watchlist-cache';

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
  test('TV variants use unique cached Letterboxd entries without weakening watchlist identity', () => {
    const client = new QueryClient();
    const show = { ...film('tmdb-tv-228880', 'Beast Boy: Lone Wolf'), type: 'TV' as const, year: 2024, externalIds: { tmdb: 228880 } };
    const entry = { ...film('letterboxd-beast-boy-lone-wolf', show.title), year: 2024, externalIds: { letterboxd: 'beast-boy-lone-wolf' } };
    client.setQueryData(['letterboxd', 'list-films', 'user', 'animation'], { pages: [{ items: [entry] }] });
    expect(findLetterboxdTwinInCache(client, show)?.id).toBe(entry.id);
    expect(findLetterboxdTwinInCache(client, { ...show, year: 2023 })).toBeUndefined();
    client.setQueryData(['letterboxd', 'list-films', 'user', 'animation'], { pages: [{ items: [{ ...entry, externalIds: { ...entry.externalIds, tmdb: 8 } }] }] });
    expect(findLetterboxdTwinInCache(client, show)).toBeUndefined();
    client.setQueryData(['letterboxd', 'list-films', 'user', 'animation'], { pages: [{ items: [entry] }] });
    client.setQueryData(['letterboxd', 'film', 'beast-boy-lone-wolf', true], { ...entry, externalIds: { ...entry.externalIds, tmdb: 8 } });
    expect(findLetterboxdTwinInCache(client, show)).toBeUndefined();
    client.removeQueries({ queryKey: ['letterboxd', 'film'] });
    client.setQueryData(['letterboxd', 'watchlist', 'user'], [{ ...entry, id: 'letterboxd-other', externalIds: { letterboxd: 'other' } }]);
    expect(findLetterboxdTwinInCache(client, show)).toBeUndefined();
  });
  test('resolves a Trakt-sourced watchlist item that belongs to no feed slot', () => {
    // The regression it exists for: after R25 the merged row carries Trakt and
    // AniList items, and anything the details chain cannot resolve renders
    // "Not found".
    expect(findInWatchlistCache(seed(), 'trakt-1')?.title).toBe('Heat');
    expect(findInWatchlistCache(seed(), 'anilist-5')?.title).toBe('Perfect Blue');
  });

  test('an unknown id is undefined rather than the first row', () => {
    expect(findInWatchlistCache(seed(), 'trakt-999')).toBeUndefined();
  });
});
