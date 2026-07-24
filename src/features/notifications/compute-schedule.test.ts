import { describe, expect, test } from 'bun:test';

import type { AniListUpNextInput, TraktUpNextInput, UpNextInputs } from '@/features/up-next/types';
import type { NormalizedMediaItem } from '@/types/media';

import { computeNotificationSchedule, hashSchedule } from './compute-schedule';

const NOW = new Date('2026-07-23T12:00:00.000Z');

function isoOffset(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function item(id: string, overrides: Partial<NormalizedMediaItem> = {}): NormalizedMediaItem {
  return {
    id,
    title: `Show ${id}`,
    coverImage: '',
    type: 'TV',
    currentProgress: 1,
    progressUnit: 'episode',
    lastUpdated: '2026-07-20T00:00:00.000Z',
    externalIds: {},
    ...overrides,
  };
}

function traktInput(
  id: string,
  firstAired: string | null,
  overrides: Partial<TraktUpNextInput['nextEpisode']> = {},
  itemOverrides: Partial<NormalizedMediaItem> = {},
): TraktUpNextInput {
  return {
    item: item(id, itemOverrides),
    nextEpisode: {
      season: 1,
      number: 2,
      firstAired,
      ...overrides,
    },
  };
}

function anilistInput(
  id: string,
  airingAt: string,
  episode = 4,
  itemOverrides: Partial<NormalizedMediaItem> = {},
): AniListUpNextInput {
  return {
    item: item(id, { type: 'ANIME', currentProgress: episode - 1, ...itemOverrides }),
    nextAiring: { episode, airingAt },
    totalEpisodes: 24,
  };
}

function inputs(trakt: TraktUpNextInput[], anilist: AniListUpNextInput[]): UpNextInputs {
  return { trakt, anilist, errors: [] };
}

describe('computeNotificationSchedule', () => {
  test('episode airing in 3 days is included with its exact instant', () => {
    const result = computeNotificationSchedule(
      inputs([traktInput('a', isoOffset(72))], []),
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].fireInstant).toBe(isoOffset(72));
  });

  test('episode aired 1 minute before now is excluded', () => {
    const result = computeNotificationSchedule(
      inputs([traktInput('a', isoOffset(-1 / 60))], []),
      NOW,
    );
    expect(result).toEqual([]);
  });

  test('episode 8 days out is excluded, and exactly now+7d is excluded (half-open window)', () => {
    const eightDaysOut = computeNotificationSchedule(
      inputs([traktInput('a', isoOffset(8 * 24))], []),
      NOW,
    );
    expect(eightDaysOut).toEqual([]);

    const exactlySevenDays = computeNotificationSchedule(
      inputs([traktInput('b', isoOffset(7 * 24))], []),
      NOW,
    );
    expect(exactlySevenDays).toEqual([]);
  });

  test('60 candidates are capped to the 50 nearest', () => {
    const shows = Array.from({ length: 60 }, (_, index) =>
      traktInput(`s${index}`, isoOffset(1 + index)),
    );
    const result = computeNotificationSchedule(inputs(shows, []), NOW);
    expect(result).toHaveLength(50);
    // Nearest-first: the 50 soonest instants survive.
    expect(result[0].itemId).toBe('s0');
    expect(result.map((c) => c.itemId)).not.toContain('s59');
  });

  test('same show from Trakt and AniList with a shared TMDB id dedupes to one candidate', () => {
    const shared = { externalIds: { tmdb: 999 } };
    const result = computeNotificationSchedule(
      inputs(
        [traktInput('trakt-1', isoOffset(24), {}, shared)],
        [anilistInput('anilist-1', isoOffset(30), 4, shared)],
      ),
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].itemId).toBe('anilist-1');
  });

  test('hash is order-insensitive on input but changes when an instant changes', () => {
    const a = traktInput('a', isoOffset(24));
    const b = traktInput('b', isoOffset(48));

    const forward = computeNotificationSchedule(inputs([a, b], []), NOW);
    const backward = computeNotificationSchedule(inputs([b, a], []), NOW);
    expect(hashSchedule(forward)).toBe(hashSchedule(backward));

    const changed = computeNotificationSchedule(
      inputs([a, traktInput('b', isoOffset(49))], []),
      NOW,
    );
    expect(hashSchedule(changed)).not.toBe(hashSchedule(forward));
  });

  test('a DST-crossing instant keeps its absolute epoch value', () => {
    // US DST ends 2026-11-01 — a fixed UTC instant spanning that boundary
    // must survive unchanged, since only epoch comparisons are used.
    const dstNow = new Date('2026-10-30T12:00:00.000Z');
    const acrossBoundary = new Date(dstNow.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = computeNotificationSchedule(
      inputs([traktInput('a', acrossBoundary)], []),
      dstNow,
    );
    expect(result[0].fireInstant).toBe(acrossBoundary);
  });

  test('a null firstAired is excluded (unknown instant is not schedulable)', () => {
    const result = computeNotificationSchedule(inputs([traktInput('a', null)], []), NOW);
    expect(result).toEqual([]);
  });
});

describe('hashSchedule', () => {
  test('empty schedule hashes to a stable empty value', () => {
    expect(hashSchedule([])).toBe('');
  });
});
