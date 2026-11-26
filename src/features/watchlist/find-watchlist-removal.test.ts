import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import { findWatchlistRemoval } from './find-watchlist-removal';
import type { WatchlistInputs } from './types';

function film(overrides: Partial<NormalizedMediaItem> = {}): NormalizedMediaItem {
  return {
    id: 'trakt-1',
    title: 'A Film',
    coverImage: '',
    type: 'MOVIE',
    year: 1997,
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-30T00:00:00.000Z',
    externalIds: { trakt: 1, tmdb: 77 },
    ...overrides,
  };
}

function inputs(partial: Partial<WatchlistInputs> = {}): WatchlistInputs {
  return { inputs: [], errors: [], incomplete: [], ...partial };
}

describe('findWatchlistRemoval (plan 0033 follow-up)', () => {
  test('recognises a details-screen item by shared merge keys, not id', () => {
    const data = inputs({
      inputs: [
        { item: film(), source: 'trakt' },
        {
          item: film({ id: 'letterboxd-a-film', externalIds: { letterboxd: 'a-film' } }),
          source: 'letterboxd',
        },
      ],
    });
    const removal = findWatchlistRemoval(data, film({ id: 'tmdb-77', externalIds: { tmdb: 77 } }));
    expect(removal?.entry.sources).toEqual(['trakt', 'letterboxd']);
  });

  test('carries the gather health fields the remove picker routes on', () => {
    const data = inputs({
      inputs: [{ item: film(), source: 'trakt' }],
      errors: [{ provider: 'anilist', message: '502' }],
      incomplete: ['letterboxd'],
    });
    const removal = findWatchlistRemoval(data, film());
    expect(removal?.errors).toEqual([{ provider: 'anilist', message: '502' }]);
    expect(removal?.incomplete).toEqual(['letterboxd']);
  });

  test('an item on no gathered list is null, never a guess', () => {
    const data = inputs({ inputs: [{ item: film(), source: 'trakt' }] });
    expect(
      findWatchlistRemoval(
        data,
        film({ id: 'trakt-2', title: 'Another', externalIds: { tmdb: 99 } }),
      ),
    ).toBeNull();
  });

  test('removing from the AniList entry’s own screen removes that entry, not the merged volume (plan 0117 B6)', () => {
    const manga = film({
      id: 'anilist-143703',
      title: 'Nisemonogatari',
      type: 'MANGA',
      externalIds: { anilist: 143703 },
      readingCredits: { people: ['NISIOISIN'], format: 'NOVEL', volumes: 2 },
    });
    const book = film({
      id: 'hardcover-61',
      title: 'NISEMONOGATARI, Part 1 (Light Novel)',
      type: 'BOOK',
      externalIds: { hardcover: 61 },
      readingCredits: { people: ['NISIOISIN'] },
    });
    const data = inputs({
      inputs: [
        { item: manga, source: 'anilist' },
        { item: book, source: 'hardcover' },
      ],
    });
    expect(findWatchlistRemoval(data, manga, [manga])?.entry).toMatchObject({
      item: { id: 'anilist-143703' },
      sources: ['anilist'],
    });
    expect(findWatchlistRemoval(data, book, [manga])?.entry).toMatchObject({
      item: { id: 'hardcover-61' },
      sources: ['anilist', 'hardcover'],
    });
  });
});
