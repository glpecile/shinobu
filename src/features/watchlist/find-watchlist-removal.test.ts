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
  test('finds the merged entry for the exact gathered item', () => {
    const data = inputs({ inputs: [{ item: film(), source: 'trakt' }] });
    const removal = findWatchlistRemoval(data, film());
    expect(removal?.entry.sources).toEqual(['trakt']);
  });

  test('recognises a details-screen item by shared merge keys, not id', () => {
    // The details screen opens a TMDB-sourced copy whose id never equals the
    // gathered row's — the same recognition case `useIsWatchlisted` handles.
    const data = inputs({
      inputs: [
        { item: film(), source: 'trakt' },
        {
          item: film({ id: 'letterboxd-a-film', externalIds: { letterboxd: 'a-film' } }),
          source: 'letterboxd',
        },
      ],
    });
    const removal = findWatchlistRemoval(
      data,
      film({ id: 'tmdb-77', externalIds: { tmdb: 77 } }),
    );
    expect(removal?.entry.sources).toEqual(['trakt', 'letterboxd']);
  });

  test('maps a match through a losing input to the merged row', () => {
    // The item matches only the Letterboxd copy (title|year), whose merged row
    // is won by Trakt precedence — sourceIds is what connects the two.
    const data = inputs({
      inputs: [
        { item: film(), source: 'trakt' },
        {
          item: film({
            id: 'letterboxd-a-film',
            externalIds: { letterboxd: 'a-film' },
          }),
          source: 'letterboxd',
        },
      ],
    });
    const removal = findWatchlistRemoval(
      data,
      film({ id: 'other', externalIds: {} }),
    );
    expect(removal?.entry.id).toBe('trakt-1');
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
});
