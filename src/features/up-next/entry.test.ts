import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import { entryInstant, entryLabel } from './entry';
import type { UpNextEntry, UpNextEpisode, UpNextRelease } from './types';

/**
 * The two accessors that cross the `kind` union (plan 0030 KTD-1). Everything
 * downstream — ordering, day buckets, badges, the card's second line — reads an
 * entry through these, so a wrong answer here is wrong in four places at once.
 */

const SHOW: NormalizedMediaItem = {
  id: 'trakt-1',
  title: 'Show',
  coverImage: '',
  type: 'TV',
  currentProgress: 3,
  progressUnit: 'episode',
  lastUpdated: '2026-07-22T00:00:00.000Z',
  externalIds: { trakt: 1 },
};

const FILM: NormalizedMediaItem = {
  id: 'trakt-2',
  title: 'Film',
  coverImage: '',
  type: 'MOVIE',
  currentProgress: 0,
  progressUnit: 'episode',
  lastUpdated: '2026-07-22T00:00:00.000Z',
  externalIds: { trakt: 2 },
};

function episodeEntry(episode: Partial<UpNextEpisode> = {}): UpNextEntry {
  return {
    kind: 'episode',
    id: 'trakt-1-s1e4',
    item: SHOW,
    episode: { season: 1, number: 4, ...episode },
    status: 'aired',
    source: 'trakt',
  };
}

function releaseEntry(release: Partial<UpNextRelease> = {}): UpNextEntry {
  return {
    kind: 'release',
    id: 'trakt-2-theatrical',
    item: FILM,
    release: { kind: 'theatrical', date: '2026-07-24', ...release },
    status: 'upcoming',
    source: 'trakt',
  };
}

describe('entryLabel', () => {
  test('an episode with a canonical season reads S1E4 · Title', () => {
    expect(entryLabel(episodeEntry({ title: 'The Fourth' }))).toBe(
      'S1E4 · The Fourth',
    );
  });

  test('an untitled episode is just its code', () => {
    expect(entryLabel(episodeEntry())).toBe('S1E4');
  });

  test('a seasonless AniList entry reads E7, never a fabricated S1E7', () => {
    // Plan 0027: an AniList entry counts its own episodes and carries no
    // canonical season — stamping "S1" here is the fabrication that wrote
    // phantom season-1 history for every sequel-season anime.
    expect(entryLabel(episodeEntry({ season: undefined, number: 7 }))).toBe('E7');
  });

  test('each release kind names itself rather than repeating the date', () => {
    expect(entryLabel(releaseEntry({ kind: 'theatrical' }))).toBe('In theaters');
    expect(entryLabel(releaseEntry({ kind: 'digital' }))).toBe('Streaming');
    expect(entryLabel(releaseEntry({ kind: 'physical' }))).toBe(
      'Physical release',
    );
  });
});

describe('entryInstant', () => {
  test('an episode answers with its air instant', () => {
    expect(entryInstant(episodeEntry({ firstAired: '2026-07-24T21:00:00Z' }))).toBe(
      '2026-07-24T21:00:00Z',
    );
  });

  test('an episode with no air instant answers undefined, not an empty string', () => {
    // AniList back-episodes are aired by construction with nothing to prove it;
    // every caller treats undefined as "no cell, no badge".
    expect(entryInstant(episodeEntry())).toBeUndefined();
  });

  test('a release answers with its bare calendar date, unflattened', () => {
    // Deliberately *not* normalized to an instant: `isDateOnly` is what stops
    // the card asserting a 00:00 screening nobody stated.
    expect(entryInstant(releaseEntry({ date: '2026-07-24' }))).toBe('2026-07-24');
  });
});
