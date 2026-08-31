import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import { calendarBadges, continueWatchingBadges, isNewEpisode } from './badges';
import type { UpNextEntry, UpNextEpisode, UpNextEpisodeEntry } from './types';

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
  episode: Partial<UpNextEpisode> = {},
  item: NormalizedMediaItem = ITEM,
): UpNextEpisodeEntry {
  return {
    kind: 'episode',
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
  test('leads with the relative day, then the local air time', () => {
    expect(
      calendarBadges(entry({ firstAired: localInstant(7, 24, 21) }), NOW),
    ).toEqual([{ label: 'Tomorrow', tone: 'accent' }, { label: '21:00' }]);
  });

  test('an episode airing later today says so to the minute', () => {
    // The ambiguous case the time badge exists for: "Today" alone can't tell
    // an episode that already dropped from one still hours out.
    const airsTonight = new Date(2026, 6, 23, 22, 15).toISOString();
    expect(calendarBadges(entry({ firstAired: airsTonight }), NOW)).toEqual(
      [{ label: 'Today', tone: 'accent' }, { label: '22:15' }],
    );
  });

  test('a date-only air date keeps the day badge and drops the time', () => {
    // Local midnight is the right ordering key but the wrong thing to show.
    expect(calendarBadges(entry({ firstAired: '2026-07-24' }), NOW)).toEqual(
      [{ label: 'Tomorrow', tone: 'accent' }],
    );
  });

  test('an entry with no instant carries no badges at all', () => {
    expect(calendarBadges(entry(), NOW)).toEqual([]);
  });

  test('a film release is badged from its date through the same accessor', () => {
    // The union's payoff: the badge never touched `.episode`, so a release
    // lands on its relative day and — being date-only — carries no time.
    const release: UpNextEntry = {
      kind: 'release',
      id: 'trakt-9-theatrical',
      item: { ...ITEM, id: 'trakt-9', title: 'Film', type: 'MOVIE' },
      release: { kind: 'theatrical', date: '2026-07-24' },
      status: 'upcoming',
      source: 'trakt',
    };
    expect(calendarBadges(release, NOW)).toEqual([
      { label: 'Tomorrow', tone: 'accent' },
    ]);
  });
});

describe('continueWatchingBadges — behind count', () => {
  test('two or more aired-unwatched episodes get a behind pill', () => {
    expect(
      continueWatchingBadges({ ...entry(), episodesBehind: 3 }, NOW),
    ).toContainEqual({ label: '3 behind' });
  });

  test('one behind is what the card already says by existing — no pill', () => {
    expect(continueWatchingBadges({ ...entry(), episodesBehind: 1 }, NOW)).toEqual(
      [],
    );
    expect(continueWatchingBadges(entry(), NOW)).toEqual([]);
  });
});
