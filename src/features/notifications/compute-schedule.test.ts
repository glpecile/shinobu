import { describe, expect, test } from 'bun:test';

import type {
  AniListUpNextInput,
  CalendarUpNextInput,
  ProgressUpNextInput,
  ReleaseUpNextInput,
  UpNextInputs,
} from '@/features/up-next/types';
import type { NormalizedMediaItem } from '@/types/media';

import type { NotificationCandidate } from './compute-schedule';
import { computeNotificationSchedule, hashSchedule } from './compute-schedule';

const NOW = new Date('2026-07-23T12:00:00.000Z');

/**
 * A release date is a *local* calendar day, so every release assertion has to
 * be built from local wall-clock fields — a UTC literal would pass or fail
 * depending on the machine's timezone, which is exactly the class of bug
 * `lib/time` exists to prevent.
 */
function localTime(date: string, hours: number, minutes = 0): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

/** The same local day, `days` later — via the Date constructor, so DST rolls. */
function localDay(from: Date, days: number): string {
  const shifted = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${shifted.getFullYear()}-${month}-${day}`;
}

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
  overrides: Partial<ProgressUpNextInput['nextEpisode']> = {},
  itemOverrides: Partial<NormalizedMediaItem> = {},
): ProgressUpNextInput {
  return {
    item: item(id, itemOverrides),
    source: 'trakt',
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
    // The list read carries PLANNING entries too since plan 0030 R12; the
    // schedule is only ever asked about series the user is actually watching.
    status: 'CURRENT',
    nextAiring: { episode, airingAt },
    totalEpisodes: 24,
  };
}

function releaseInput(
  id: string,
  date: string,
  kind: ReleaseUpNextInput['kind'] = 'theatrical',
  itemOverrides: Partial<NormalizedMediaItem> = {},
): ReleaseUpNextInput {
  return {
    item: item(id, { title: `Film ${id}`, type: 'MOVIE', currentProgress: 0, ...itemOverrides }),
    kind,
    date,
    source: 'trakt',
  };
}

function calendarInput(
  id: string,
  firstAired: string,
  overrides: { season?: number; number?: number } = {},
  itemOverrides: Partial<NormalizedMediaItem> = {},
): CalendarUpNextInput {
  return {
    item: item(id, itemOverrides),
    source: 'trakt',
    episode: { season: 1, number: 2, firstAired, ...overrides },
  };
}

function inputs(
  progress: ProgressUpNextInput[],
  anilist: AniListUpNextInput[],
  releases: ReleaseUpNextInput[] = [],
  calendar: CalendarUpNextInput[] = [],
): UpNextInputs {
  return { progress, calendar, releases, anilist, errors: [] };
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

/**
 * The 09:00 rule is a named regression guard (plan 0030 R10): local midnight is
 * the right ordering key for a bare release date and a hostile alert, and a
 * release whose moment already passed must never fire on the next refresh
 * (plan 0020 R2). Both directions of the boundary are asserted explicitly.
 */
describe('computeNotificationSchedule — release candidates', () => {
  const RELEASE_DAY = '2026-07-30';

  function scheduleRelease(now: Date, date = RELEASE_DAY) {
    return computeNotificationSchedule(inputs([], [], [releaseInput('f1', date)]), now);
  }

  test('a release dated today is not scheduled once 09:00 local has passed', () => {
    expect(scheduleRelease(localTime(RELEASE_DAY, 9, 1))).toEqual([]);
    expect(scheduleRelease(localTime(RELEASE_DAY, 23, 59))).toEqual([]);
  });

  test('before 09:00 local the same release is scheduled, firing at 09:00 local', () => {
    const result = scheduleRelease(localTime(RELEASE_DAY, 8, 59));
    expect(result).toHaveLength(1);
    expect(result[0].fireInstant).toBe(localTime(RELEASE_DAY, 9).toISOString());
    expect(result[0]).toMatchObject({
      kind: 'release',
      release: 'theatrical',
      itemId: 'f1',
      title: 'Film f1',
    });
  });

  test('at exactly 09:00 local it is not scheduled — the moment has arrived', () => {
    // Half-open, matching `hasAired`: an instant equal to `now` counts as gone,
    // exactly as an episode airing at `now` is already excluded above.
    expect(scheduleRelease(localTime(RELEASE_DAY, 9, 0))).toEqual([]);
  });

  test('a release later in the week fires at 09:00 on its own local day', () => {
    const now = localTime('2026-07-23', 12);
    const day = localDay(now, 3);
    const result = scheduleRelease(now, day);
    expect(result[0].fireInstant).toBe(localTime(day, 9).toISOString());
  });

  test('a release outside the shared 7-day window is excluded', () => {
    const now = localTime('2026-07-23', 12);
    expect(scheduleRelease(now, localDay(now, 8))).toEqual([]);
    expect(scheduleRelease(now, localDay(now, -1))).toEqual([]);
  });

  test('one film on two watchlists yields one candidate per release kind', () => {
    const now = localTime('2026-07-23', 12);
    const date = localDay(now, 2);
    const shared = { externalIds: { tmdb: 555 } };
    const result = computeNotificationSchedule(
      inputs(
        [],
        [],
        [
          releaseInput('trakt-film', date, 'theatrical', shared),
          releaseInput('letterboxd-film', date, 'theatrical', shared),
          releaseInput('trakt-film', date, 'digital', shared),
        ],
      ),
      now,
    );
    expect(result).toHaveLength(2);
    expect(result.map((c) => (c.kind === 'release' ? c.release : c.kind)).sort()).toEqual([
      'digital',
      'theatrical',
    ]);
  });

  test('the hash guard changes when a release date moves', () => {
    const now = localTime('2026-07-23', 12);
    const original = scheduleRelease(now, localDay(now, 2));
    const moved = scheduleRelease(now, localDay(now, 3));
    expect(hashSchedule(moved)).not.toBe(hashSchedule(original));
    expect(hashSchedule(scheduleRelease(now, localDay(now, 2)))).toBe(hashSchedule(original));
  });

  test('the 50-cap holds nearest-first across mixed kinds', () => {
    const now = localTime('2026-07-23', 12);
    // 48 episodes at now+1h..now+48h, plus releases on local days +1/+3/+5
    // (09:00 → ~21h/~69h/~117h). Sorted, the +5 release is the 51st and the
    // only candidate the cap drops — the interleaving is what's under test.
    const episodes = Array.from({ length: 48 }, (_, index) =>
      traktInput(`e${index}`, new Date(now.getTime() + (index + 1) * 60 * 60 * 1000).toISOString()),
    );
    const releases = [1, 3, 5].map((days) => releaseInput(`r${days}`, localDay(now, days)));

    const result = computeNotificationSchedule(inputs(episodes, [], releases), now);

    expect(result).toHaveLength(50);
    const ids = result.map((c) => c.itemId);
    expect(ids).toContain('r1');
    expect(ids).toContain('r3');
    expect(ids).not.toContain('r5');
    expect(result.some((c) => c.kind === 'episode')).toBe(true);
    // Strictly nearest-first regardless of kind.
    const instants = result.map((c) => new Date(c.fireInstant).getTime());
    expect(instants).toEqual([...instants].sort((a, b) => a - b));
  });
});

/**
 * The regression guard for the gap adversarial review found in plan 0030: the
 * schedule read `inputs.trakt` (the *watched* pool) and never
 * `inputs.traktCalendar`, so the feature's headline case — watchlist a premiere,
 * be told when it airs — rendered a Calendar card and then silently never fired.
 */
describe('computeNotificationSchedule — watchlisted episodes (R9)', () => {
  test('a never-watched watchlisted show still schedules its premiere', () => {
    const result = computeNotificationSchedule(
      inputs([], [], [], [calendarInput('w1', isoOffset(48), { season: 1, number: 1 })]),
      NOW,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'episode',
      itemId: 'w1',
      season: 1,
      episode: 1,
    });
  });

  test('a show past the 20-show pool cap notifies from the calendar source', () => {
    // Nothing in the pool at all — exactly what UP_NEXT_POOL_SIZE truncation
    // looks like from the scheduler's side.
    const result = computeNotificationSchedule(
      inputs([], [], [], [calendarInput('deep', isoOffset(24))]),
      NOW,
    );

    expect(result.map((candidate) => candidate.itemId)).toEqual(['deep']);
  });

  test('an airing reached by both Trakt sources fires once, not twice', () => {
    const airing = isoOffset(36);
    const result = computeNotificationSchedule(
      inputs(
        [traktInput('dup', airing)],
        [],
        [],
        [calendarInput('dup', airing, { season: 1, number: 2 })],
      ),
      NOW,
    );

    expect(result).toHaveLength(1);
  });

  test('a different episode of the same show is not swallowed by the dedupe', () => {
    const result = computeNotificationSchedule(
      inputs(
        [traktInput('show', isoOffset(24))],
        [],
        [],
        [calendarInput('show', isoOffset(48), { season: 1, number: 3 })],
      ),
      NOW,
    );

    expect(result).toHaveLength(2);
    expect(result.map((c) => (c.kind === 'episode' ? c.episode : null))).toEqual([2, 3]);
  });

  test('a calendar row with no air instant contributes nothing', () => {
    const bare: CalendarUpNextInput = {
      item: item('x'),
      source: 'trakt',
      episode: { season: 1, number: 1, firstAired: null },
    };
    expect(
      computeNotificationSchedule(inputs([], [], [], [bare]), NOW),
    ).toHaveLength(0);
  });
});

/**
 * A whole season landing at once is one event (owner decision 2026-07-27). Ten
 * notifications for one show on one morning is the tray version of the ten
 * identical Calendar cards `groupDayEntries` collapses — and at ten a single
 * drop takes a fifth of `MAX_SCHEDULED`.
 */
describe('computeNotificationSchedule — season drops', () => {
  const now = localTime('2026-07-27', 12);
  const dropDay = localDay(now, 4);

  /**
   * `count` episodes of one show, all landing on the same local day. Staggered
   * a minute apart on purpose: Trakt routinely spreads a batch's `first_aired`,
   * and "the season dropped" is a claim about the day, not the second.
   */
  function seasonDrop(
    id: string,
    count: number,
    season = 2,
  ): CalendarUpNextInput[] {
    return Array.from({ length: count }, (_, index) =>
      calendarInput(id, localTime(dropDay, 4, index).toISOString(), {
        season,
        number: index + 1,
      }),
    );
  }

  test('a whole season landing at once is one notification', () => {
    const result = computeNotificationSchedule(
      inputs([], [], [], seasonDrop('bat', 10)),
      now,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'episode',
      itemId: 'bat',
      season: 2,
      // Names the *first* of the batch, which is the airing it fires on.
      episode: 1,
      count: 10,
    });
    expect(result[0].fireInstant).toBe(localTime(dropDay, 4, 0).toISOString());
  });

  test('a lone episode carries no count at all', () => {
    const result = computeNotificationSchedule(
      inputs([], [], [], seasonDrop('bat', 1)),
      now,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('count');
  });

  test('two shows dropping the same day stay two notifications', () => {
    const result = computeNotificationSchedule(
      inputs([], [], [], [...seasonDrop('bat', 4), ...seasonDrop('andor', 3)]),
      now,
    );

    expect(result).toHaveLength(2);
    expect(result.map((candidate) => candidate.itemId)).toEqual(['bat', 'andor']);
  });

  test('one show airing on two days is two notifications, neither batched', () => {
    const result = computeNotificationSchedule(
      inputs(
        [],
        [],
        [],
        [
          calendarInput('weekly', localTime(localDay(now, 2), 21).toISOString(), {
            season: 3,
            number: 1,
          }),
          calendarInput('weekly', localTime(localDay(now, 5), 21).toISOString(), {
            season: 3,
            number: 2,
          }),
        ],
      ),
      now,
    );

    expect(result).toHaveLength(2);
    expect(result.every((candidate) => !('count' in candidate))).toBe(true);
  });

  test('a batch already half-landed counts only what is still ahead', () => {
    const today = localDay(now, 0);
    const result = computeNotificationSchedule(
      inputs(
        [],
        [],
        [],
        [
          // 09:00 is behind `now` — already out, already dropped by the window.
          calendarInput('bat', localTime(today, 9).toISOString(), { season: 2, number: 1 }),
          calendarInput('bat', localTime(today, 9, 1).toISOString(), { season: 2, number: 2 }),
          calendarInput('bat', localTime(today, 14).toISOString(), { season: 2, number: 3 }),
          calendarInput('bat', localTime(today, 15).toISOString(), { season: 2, number: 4 }),
        ],
      ),
      now,
    );

    expect(result).toHaveLength(1);
    // The count states what the user has yet to see, not what Trakt listed.
    expect(result[0]).toMatchObject({ episode: 3, count: 2 });
  });

  test('a season drop costs one slot against the 50-notification cap', () => {
    const result = computeNotificationSchedule(
      inputs(
        [],
        [],
        [],
        [
          ...seasonDrop('bat', 60),
          calendarInput('andor', localTime(localDay(now, 5), 21).toISOString(), {
            season: 2,
            number: 9,
          }),
        ],
      ),
      now,
    );

    expect(result).toHaveLength(2);
    expect(result.map((candidate) => candidate.itemId)).toEqual(['bat', 'andor']);
  });

  test('a film’s theatrical and digital dates on one day stay two notifications', () => {
    // Releases never batch: they say different things ("in theaters" /
    // "streaming"), which is the one fact each notification carries.
    const day = localDay(now, 3);
    const result = computeNotificationSchedule(
      inputs(
        [],
        [],
        [releaseInput('dune', day, 'theatrical'), releaseInput('dune', day, 'digital')],
      ),
      now,
    );

    expect(result).toHaveLength(2);
  });
});

describe('hashSchedule', () => {
  test('empty schedule hashes to a stable empty value', () => {
    expect(hashSchedule([])).toBe('');
  });

  test('an unbatched episode hashes exactly as it did before batching', () => {
    // Byte-identical to the pre-batch subject, so shipping this doesn't
    // invalidate every stored hash and reschedule everyone once on upgrade (R7).
    const single: NotificationCandidate = {
      kind: 'episode',
      itemId: 'a',
      title: 'Show a',
      season: 1,
      episode: 2,
      fireInstant: '2026-07-31T04:00:00.000Z',
    };

    expect(hashSchedule([single])).toBe('a/1/2/2026-07-31T04:00:00.000Z');
  });

  test('a batch that gains an episode reschedules', () => {
    const base: NotificationCandidate = {
      kind: 'episode',
      itemId: 'bat',
      title: 'Batman: Caped Crusader',
      season: 2,
      episode: 1,
      fireInstant: '2026-07-31T04:00:00.000Z',
    };

    // Keying on the lead episode alone would leave the tray claiming ten.
    expect(hashSchedule([{ ...base, count: 10 }])).not.toBe(
      hashSchedule([{ ...base, count: 11 }]),
    );
    expect(hashSchedule([{ ...base, count: 10 }])).not.toBe(hashSchedule([base]));
  });
});
