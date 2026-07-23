import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import { calendarBadges, continueWatchingBadges, isNewEpisode } from './badges';
import type { UpNextEntry } from './types';

const NOW = new Date(2026, 6, 23, 20, 0);

function localInstant(month: number, day: number, hours = 12): string {
  return new Date(2026, month - 1, day, hours).toISOString();
}

const ITEM: NormalizedMediaItem = {
  id: 'trakt-1',
  title: 'Show',
  coverImage: '',
  type: 'TV',
  currentProgress: 3,
  progressUnit: 'episode',
  lastUpdated: '2026-07-22T00:00:00.000Z',
  externalIds: { trakt: 1 },
};

function entry(
  episode: Partial<UpNextEntry['episode']> = {},
  item: NormalizedMediaItem = ITEM,
): UpNextEntry {
  return {
    id: 'trakt-1-s1e4',
    item,
    episode: { season: 1, number: 4, ...episode },
    status: 'aired',
    source: 'trakt',
  };
}

describe('isNewEpisode', () => {
  test('an episode aired today or in the last six days is new', () => {
    expect(isNewEpisode(entry({ firstAired: localInstant(7, 23, 9) }), NOW)).toBe(
      true,
    );
    expect(isNewEpisode(entry({ firstAired: localInstant(7, 18) }), NOW)).toBe(
      true,
    );
  });

  test('a week-old episode is no longer new', () => {
    expect(isNewEpisode(entry({ firstAired: localInstant(7, 16) }), NOW)).toBe(
      false,
    );
  });

  test('an episode with no air instant is never new', () => {
    // AniList back-episodes are aired by construction but carry no instant —
    // absence must not read as "aired just now".
    expect(isNewEpisode(entry(), NOW)).toBe(false);
  });
});

describe('continueWatchingBadges', () => {
  test('shows episode runtime, falling back to the show runtime', () => {
    expect(continueWatchingBadges(entry({ runtime: 48 }), NOW)).toEqual([
      { label: '48m' },
    ]);
    expect(
      continueWatchingBadges(entry({}, { ...ITEM, runtime: 24 }), NOW),
    ).toEqual([{ label: '24m' }]);
  });

  test('a recent episode adds the New pill after the runtime', () => {
    expect(
      continueWatchingBadges(
        entry({ runtime: 48, firstAired: localInstant(7, 22) }),
        NOW,
      ),
    ).toEqual([{ label: '48m' }, { label: 'New', tone: 'accent' }]);
  });

  test('no runtime and no recent air date means no badges at all', () => {
    expect(continueWatchingBadges(entry(), NOW)).toEqual([]);
  });
});

describe('calendarBadges', () => {
  test('leads with the relative day', () => {
    expect(calendarBadges(entry({ firstAired: localInstant(7, 24) }), NOW)).toEqual(
      [{ label: 'Tomorrow', tone: 'accent' }],
    );
  });

  test('an entry with no instant carries no day badge', () => {
    expect(calendarBadges(entry(), NOW)).toEqual([]);
  });
});
