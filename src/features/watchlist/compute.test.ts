import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import { computeWatchlist, watchlistMergeKeys } from './compute';
import type { WatchlistInput } from './types';

/**
 * `computeWatchlist` is pure — no React, no Effect, no query client — so this
 * suite needs no module stubs at all. That is the point of the split.
 */

function item(
  overrides: Partial<NormalizedMediaItem> & Pick<NormalizedMediaItem, 'id'>,
): NormalizedMediaItem {
  return {
    title: 'Heat',
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-20T00:00:00.000Z',
    externalIds: {},
    ...overrides,
  };
}

function traktRow(
  overrides: Partial<NormalizedMediaItem> & Pick<NormalizedMediaItem, 'id'>,
  addedAt = '2026-07-20T00:00:00.000Z',
): WatchlistInput {
  return { item: item(overrides), source: 'trakt', addedAt };
}

function letterboxdRow(
  overrides: Partial<NormalizedMediaItem> & Pick<NormalizedMediaItem, 'id'>,
): WatchlistInput {
  return { item: item(overrides), source: 'letterboxd' };
}

describe('computeWatchlist', () => {
  test('the same film from Trakt and Letterboxd merges into one entry', () => {
    const entries = computeWatchlist([
      traktRow({ id: 'trakt-1', title: 'Heat', year: 1995, externalIds: { tmdb: 949 } }),
      letterboxdRow({ id: 'letterboxd-heat', title: 'Heat', year: 1995 }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].sources).toEqual(['trakt', 'letterboxd']);
    expect(entries[0].sourceIds).toEqual(['trakt-1', 'letterboxd-heat']);
    // Trakt's copy wins over Letterboxd's: richer metadata and external ids.
    expect(entries[0].id).toBe('trakt-1');
    expect(entries[0].item.externalIds.tmdb).toBe(949);
  });

  test('Simkl’s copy wins over Trakt’s (plan 0034 KTD-10/R10)', () => {
    const entries = computeWatchlist([
      traktRow({ id: 'trakt-1', title: 'Heat', year: 1995, externalIds: { tmdb: 949 } }),
      { item: item({ id: 'simkl-1', title: 'Heat', year: 1995, externalIds: { tmdb: 949, simkl: 1 } }), source: 'simkl' },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].sources).toEqual(['trakt', 'simkl']);
    expect(entries[0].id).toBe('simkl-1');
  });

  test('a TMDB movie id and a TMDB series id with the same number do not merge', () => {
    const entries = computeWatchlist([
      traktRow({ id: 'trakt-1', title: 'Film', externalIds: { tmdb: 1399 } }),
      traktRow({
        id: 'trakt-2',
        title: 'Series',
        type: 'TV',
        externalIds: { tmdb: 1399 },
      }),
    ]);

    expect(entries).toHaveLength(2);
  });

  test('an unmatchable Letterboxd film stands as its own entry, never guessed at', () => {
    const entries = computeWatchlist([
      traktRow({ id: 'trakt-1', title: 'Heat', year: 1995, externalIds: { tmdb: 949 } }),
      letterboxdRow({ id: 'letterboxd-drive', title: 'Drive', year: 2011 }),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.sources)).toEqual([['trakt'], ['letterboxd']]);
  });

  test('a year mismatch by one does not merge (exact year only, never a ±1 window)', () => {
    const entries = computeWatchlist([
      traktRow({ id: 'trakt-1', title: 'Heat', year: 1995 }),
      letterboxdRow({ id: 'letterboxd-heat', title: 'Heat', year: 1996 }),
    ]);

    expect(entries).toHaveLength(2);
  });

  test('title matching is case- and punctuation-insensitive but film-like only', () => {
    const merged = computeWatchlist([
      traktRow({ id: 'trakt-1', title: 'WALL·E', year: 2008 }),
      letterboxdRow({ id: 'letterboxd-wall-e', title: 'Wall-E', year: 2008 }),
    ]);
    expect(merged).toHaveLength(1);

    // Two same-titled series of the same year carry no shared id, and the
    // title leg deliberately does not apply to them.
    const shows = computeWatchlist([
      traktRow({ id: 'trakt-1', title: 'The Office', type: 'TV', year: 2005 }),
      traktRow({ id: 'trakt-2', title: 'The Office', type: 'TV', year: 2005 }),
    ]);
    expect(shows).toHaveLength(2);
  });

  test('IMDb ids merge rows that share no TMDB id', () => {
    const entries = computeWatchlist([
      traktRow({ id: 'trakt-1', externalIds: { imdb: 'tt0113277' } }),
      letterboxdRow({ id: 'letterboxd-heat', title: 'Other title', externalIds: { imdb: 'tt0113277' } }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].sources).toEqual(['trakt', 'letterboxd']);
  });

  test('an anime on both AniList and Trakt merges with the AniList item winning', () => {
    const entries = computeWatchlist([
      traktRow({
        id: 'trakt-9',
        title: 'Frieren',
        type: 'TV',
        externalIds: { tmdb: 209867 },
      }),
      {
        item: item({
          id: 'anilist-154587',
          title: 'Sousou no Frieren',
          type: 'ANIME',
          externalIds: { anilist: 154587, tmdb: 209867 },
        }),
        source: 'anilist',
        entryId: 42,
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('anilist-154587');
    // Routing order, not gather order.
    expect(entries[0].sources).toEqual(['trakt', 'anilist']);
    expect(entries[0].sourceIds).toEqual(['trakt-9', 'anilist-154587']);
  });

  test('an anime film and an anime series with the same TMDB number stay apart', () => {
    const entries = computeWatchlist([
      {
        item: item({
          id: 'anilist-1',
          type: 'ANIME',
          isFilm: true,
          externalIds: { tmdb: 500 },
        }),
        source: 'anilist',
      },
      traktRow({ id: 'trakt-1', type: 'TV', externalIds: { tmdb: 500 } }),
    ]);

    expect(entries).toHaveLength(2);
  });

  test('sorts by add-time descending and files undated rows last, stably', () => {
    const entries = computeWatchlist([
      letterboxdRow({ id: 'letterboxd-a', title: 'A', year: 2001 }),
      traktRow({ id: 'trakt-old', title: 'Old', year: 1997 }, '2026-01-01T00:00:00.000Z'),
      letterboxdRow({ id: 'letterboxd-b', title: 'B', year: 2002 }),
      traktRow({ id: 'trakt-new', title: 'New', year: 1998 }, '2026-07-01T00:00:00.000Z'),
    ]);

    expect(entries.map((entry) => entry.id)).toEqual([
      'trakt-new',
      'trakt-old',
      // Letterboxd's page order is already most-recently-added-first, so the
      // undated block keeps it rather than scattering.
      'letterboxd-a',
      'letterboxd-b',
    ]);
  });

  test('a merged entry carries the most recent add-time any provider stated', () => {
    const entries = computeWatchlist([
      traktRow({ id: 'trakt-1', externalIds: { tmdb: 949 } }, '2026-01-01T00:00:00.000Z'),
      {
        item: item({ id: 'anilist-1', type: 'ANIME', externalIds: { tmdb: 949 } }),
        source: 'anilist',
        addedAt: '2026-07-01T00:00:00.000Z',
      },
    ]);

    expect(entries[0].addedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  test('a second Letterboxd page merges against Trakt rather than duplicating', () => {
    // The `pages.flat()` contract from the gather side, seen from here: page 2's
    // films arrive in the same input array and meet their twins.
    const page1 = Array.from({ length: 3 }, (_, index) =>
      letterboxdRow({ id: `letterboxd-${index}`, title: `Film ${index}`, year: 2000 }),
    );
    const page2 = [letterboxdRow({ id: 'letterboxd-heat', title: 'Heat', year: 1995 })];
    const entries = computeWatchlist([
      traktRow({ id: 'trakt-1', title: 'Heat', year: 1995 }),
      ...page1,
      ...page2,
    ]);

    expect(entries).toHaveLength(4);
    expect(entries.find((entry) => entry.id === 'trakt-1')?.sources).toEqual([
      'trakt',
      'letterboxd',
    ]);
  });

  test('a merged row carries the Simkl leg’s watch-history hint (plan 0036)', () => {
    // The picker's destructive warning reads this off the *merged* entry, and
    // the Simkl row loses precedence to any AniList twin. Losing the hint here
    // would silently disarm the confirm and let a removal delete watch history
    // unannounced.
    const [entry] = computeWatchlist([
      {
        item: item({ id: 'anilist-1', type: 'ANIME', externalIds: { tmdb: 949 } }),
        source: 'anilist',
      },
      {
        item: item({ id: 'simkl-1', type: 'ANIME', externalIds: { simkl: 1, tmdb: 949 } }),
        source: 'simkl',
        simklWatchedCount: 7,
      },
    ]);
    expect(entry.item.id).toBe('anilist-1');
    expect(entry.sources).toEqual(['anilist', 'simkl']);
    expect(entry.simklWatchedCount).toBe(7);
  });

  test('it never returns an UpNextEntry shape (R22) — no kind, no status', () => {
    const [entry] = computeWatchlist([traktRow({ id: 'trakt-1' })]);
    expect(Object.keys(entry).sort()).toEqual([
      'addedAt',
      'id',
      'item',
      'sourceIds',
      'sources',
    ]);
  });
});

describe('watchlistMergeKeys', () => {
  test('emits keys in precedence order: TMDB, then IMDb, then title+year', () => {
    expect(
      watchlistMergeKeys(
        item({ id: 'trakt-1', year: 1995, externalIds: { tmdb: 949, imdb: 'tt0113277' } }),
      ),
    ).toEqual(['tmdb:MOVIE:949', 'imdb:tt0113277', 'title:heat|1995']);
  });

  test('a film with no year and no ids is unmatchable rather than wrongly keyed', () => {
    expect(watchlistMergeKeys(item({ id: 'letterboxd-heat' }))).toEqual([]);
  });
});
