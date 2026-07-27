import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import {
  calendarWeek,
  computeUpNext,
  selectUpNextPool,
  UP_NEXT_POOL_SIZE,
} from './compute';
import type {
  AniListUpNextInput,
  TraktUpNextInput,
  UpNextInputs,
} from './types';

/**
 * The Up Next core, including the timezone boundary criteria todos/006 asks
 * this feature to discharge. `now` is fixed everywhere and air instants are
 * built with local-time constructors where the *calendar day* is what's under
 * test, so the suite means the same thing in every timezone it runs in.
 */

const NOW = new Date(2026, 6, 23, 20, 0); // Thu 2026-07-23, 20:00 local

function localInstant(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
): string {
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

function show(
  traktId: number,
  overrides: Partial<NormalizedMediaItem> = {},
): NormalizedMediaItem {
  return {
    id: `trakt-${traktId}`,
    title: `Show ${traktId}`,
    coverImage: '',
    type: 'TV',
    currentProgress: 4,
    progressUnit: 'episode',
    lastUpdated: '2026-07-20T12:00:00.000Z',
    externalIds: { trakt: traktId },
    ...overrides,
  };
}

function anime(
  anilistId: number,
  overrides: Partial<NormalizedMediaItem> = {},
): NormalizedMediaItem {
  return {
    id: `anilist-${anilistId}`,
    title: `Anime ${anilistId}`,
    coverImage: '',
    type: 'ANIME',
    currentProgress: 5,
    progressUnit: 'episode',
    lastUpdated: '2026-07-21T12:00:00.000Z',
    externalIds: { anilist: anilistId },
    ...overrides,
  };
}

function inputs(overrides: Partial<UpNextInputs> = {}): UpNextInputs {
  return { trakt: [], anilist: [], errors: [], ...overrides };
}

function traktInput(
  item: NormalizedMediaItem,
  nextEpisode?: TraktUpNextInput['nextEpisode'],
): TraktUpNextInput {
  return { item, ...(nextEpisode != null ? { nextEpisode } : {}) };
}

function anilistInput(
  item: NormalizedMediaItem,
  overrides: Partial<AniListUpNextInput> = {},
): AniListUpNextInput {
  return { item, nextAiring: null, totalEpisodes: null, ...overrides };
}

describe('selectUpNextPool', () => {
  test('keeps the most recently watched shows, newest first', () => {
    const shows = Array.from({ length: 21 }, (_, index) =>
      show(index + 1, {
        // Show 21 is the most recent, show 1 the oldest.
        lastUpdated: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    const pool = selectUpNextPool(shows);
    expect(pool).toHaveLength(UP_NEXT_POOL_SIZE);
    expect(pool[0].externalIds.trakt).toBe(21);
    expect(pool.at(-1)?.externalIds.trakt).toBe(2);
    // The cap is what drops show 1 — nothing else.
    expect(pool.some((item) => item.externalIds.trakt === 1)).toBe(false);
  });

  test('does not mutate its input', () => {
    const shows = [
      show(1, { lastUpdated: '2026-07-01T00:00:00.000Z' }),
      show(2, { lastUpdated: '2026-07-09T00:00:00.000Z' }),
    ];
    selectUpNextPool(shows);
    expect(shows[0].externalIds.trakt).toBe(1);
  });
});

describe('computeUpNext — Trakt shows', () => {
  test('a show behind by three episodes yields one entry, for the next one', () => {
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(1), {
            season: 2,
            number: 3,
            title: 'The Third',
            firstAired: localInstant(2026, 7, 22, 21, 0),
            runtime: 48,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.calendar).toHaveLength(0);
    expect(data.continueWatching[0]).toMatchObject({
      source: 'trakt',
      status: 'aired',
      episode: { season: 2, number: 3, title: 'The Third', runtime: 48 },
    });
  });

  test('a show caught up on everything aired lands in Calendar (KTD-2)', () => {
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(2), {
            season: 3,
            number: 1,
            firstAired: localInstant(2026, 7, 25, 21, 0),
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(1);
    expect(data.calendar[0].status).toBe('upcoming');
  });

  test('an ended or unscheduled show (no next_episode) is excluded', () => {
    const data = computeUpNext(inputs({ trakt: [traktInput(show(3))] }), NOW);
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('a next episode with no air date at all is excluded from both', () => {
    const data = computeUpNext(
      inputs({
        trakt: [traktInput(show(4), { season: 1, number: 9, firstAired: null })],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('an episode further out than the window is not in Calendar', () => {
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(5), {
            season: 1,
            number: 2,
            firstAired: localInstant(2026, 7, 30, 12, 0), // 7 days out
          }),
        ],
      }),
      NOW,
    );
    expect(data.calendar).toHaveLength(0);
  });

  test('the window includes six days out, its documented maximum', () => {
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(6), {
            season: 1,
            number: 2,
            firstAired: localInstant(2026, 7, 29, 12, 0),
          }),
        ],
      }),
      NOW,
    );
    expect(data.calendar).toHaveLength(1);
  });

  test('Calendar is ordered soonest first', () => {
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(7), {
            season: 1,
            number: 2,
            firstAired: localInstant(2026, 7, 27, 12, 0),
          }),
          traktInput(show(8), {
            season: 1,
            number: 5,
            firstAired: localInstant(2026, 7, 24, 12, 0),
          }),
        ],
      }),
      NOW,
    );
    expect(data.calendar.map((entry) => entry.item.externalIds.trakt)).toEqual([
      8, 7,
    ]);
  });

  test('Continue Watching is ordered most recently watched first', () => {
    const aired = localInstant(2026, 7, 20, 12, 0);
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(9, { lastUpdated: '2026-07-18T00:00:00.000Z' }), {
            season: 1,
            number: 2,
            firstAired: aired,
          }),
          traktInput(show(10, { lastUpdated: '2026-07-22T00:00:00.000Z' }), {
            season: 1,
            number: 3,
            firstAired: aired,
          }),
        ],
      }),
      NOW,
    );
    expect(
      data.continueWatching.map((entry) => entry.item.externalIds.trakt),
    ).toEqual([10, 9]);
  });
});

describe('computeUpNext — timezone boundaries (todos/006)', () => {
  test('aired in the origin timezone but not locally stays upcoming', () => {
    // At this instant it is already 2026-07-24 in JST, so a naive "the date
    // matches over there" read would spoil show 12's episode as available —
    // its air instant is still an hour away.
    const now = new Date('2026-07-23T23:00:00.000Z');
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(11), {
            season: 1,
            number: 4,
            firstAired: '2026-07-24T00:00:00.000+09:00', // 2026-07-23T15:00Z
          }),
          traktInput(show(12), {
            season: 1,
            number: 4,
            firstAired: '2026-07-24T09:00:00.000+09:00', // 2026-07-24T00:00Z
          }),
        ],
      }),
      now,
    );
    // The first instant has passed (15:00Z), the second has not.
    expect(
      data.continueWatching.map((entry) => entry.item.externalIds.trakt),
    ).toEqual([11]);
    expect(data.calendar.map((entry) => entry.item.externalIds.trakt)).toEqual([
      12,
    ]);
  });

  test('an instant that already passed counts as aired across a date-line boundary', () => {
    // Air instant reads as "tomorrow" on the origin calendar, but the absolute
    // instant is in the past — instants, not calendar dates, decide.
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(13), {
            season: 1,
            number: 4,
            firstAired: '2026-07-24T10:00:00.000+14:00', // 2026-07-23T20:00Z
          }),
        ],
      }),
      new Date('2026-07-23T21:00:00.000Z'),
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.calendar).toHaveLength(0);
  });

  test('a date-only air date is read as local midnight, not UTC midnight', () => {
    const data = computeUpNext(
      inputs({
        trakt: [traktInput(show(14), { season: 1, number: 2, firstAired: '2026-07-24' })],
      }),
      NOW,
    );
    expect(data.calendar).toHaveLength(1);
    expect(data.continueWatching).toHaveLength(0);
  });
});

describe('computeUpNext — AniList entries (KTD-3)', () => {
  test('a back episode below the airing pointer counts as aired without an instant', () => {
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(1, { currentProgress: 5 }), {
            nextAiring: { episode: 9, airingAt: localInstant(2026, 7, 26, 12, 0) },
            totalEpisodes: 12,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.continueWatching[0]).toMatchObject({
      source: 'anilist',
      status: 'aired',
      episode: { number: 6 },
    });
    expect(data.continueWatching[0].episode.season).toBeUndefined();
    expect(data.continueWatching[0].episode.firstAired).toBeUndefined();
  });

  test('the frontier episode is gated by its airing instant', () => {
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(2, { currentProgress: 5 }), {
            nextAiring: { episode: 6, airingAt: localInstant(2026, 7, 25, 12, 0) },
            totalEpisodes: 12,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(1);
    expect(data.calendar[0].episode.number).toBe(6);
  });

  test('a stale pointer whose instant has passed resolves as aired (hasAired wins)', () => {
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(3, { currentProgress: 5 }), {
            nextAiring: { episode: 6, airingAt: localInstant(2026, 7, 22, 12, 0) },
            totalEpisodes: 12,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.continueWatching[0].status).toBe('aired');
  });

  test('past the pointer is unknowable and excluded', () => {
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(4, { currentProgress: 6 }), {
            nextAiring: { episode: 6, airingAt: localInstant(2026, 7, 25, 12, 0) },
            totalEpisodes: 12,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('no pointer + a known total → aired while episodes remain', () => {
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(5, { currentProgress: 3 }), { totalEpisodes: 12 }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.continueWatching[0].episode).toEqual({ number: 4 });
  });

  test('no pointer + caught up to the total → excluded', () => {
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(6, { currentProgress: 12 }), { totalEpisodes: 12 }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('hiatus (no pointer, no total) is excluded rather than guessed', () => {
    const data = computeUpNext(
      inputs({ anilist: [anilistInput(anime(7, { currentProgress: 3 }))] }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('anime films have no next episode and are excluded', () => {
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(8, { currentProgress: 0, isFilm: true }), {
            totalEpisodes: 1,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
  });

  // Plan 0027 U5: the season-1 convention is gone. An AniList entry emits no
  // season at all — its episode number is entry-relative, and the log fan-out
  // resolves the canonical season from ani.zip. The old literal is what wrote
  // phantom S01 history for every sequel-season anime quick log.
  test('anime entries carry no fabricated season, and the id reflects it', () => {
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(9, { currentProgress: 0 }), { totalEpisodes: 24 }),
        ],
      }),
      NOW,
    );
    const entry = data.continueWatching[0];
    expect(entry.episode.season).toBeUndefined();
    expect(entry.episode.number).toBe(1);
    expect(entry.id).toBe('anilist-9-e1');
  });
});

describe('computeUpNext — cross-provider dedupe (R5)', () => {
  const AIRED = localInstant(2026, 7, 21, 12, 0);

  test('the same TMDB id from both providers yields one AniList-sourced entry', () => {
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(20, { externalIds: { trakt: 20, tmdb: 555 } }), {
            season: 1,
            number: 3,
            firstAired: AIRED,
          }),
        ],
        anilist: [
          anilistInput(anime(20, { currentProgress: 5 }), {
            totalEpisodes: 24,
            tmdbId: 555,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.continueWatching[0].source).toBe('anilist');
    // Differing progress across providers must not produce two cards.
    expect(data.continueWatching[0].episode.number).toBe(6);
  });

  test('an unresolvable TMDB id leaves the duplicate standing (best-effort)', () => {
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(21, { externalIds: { trakt: 21, tmdb: 777 } }), {
            season: 1,
            number: 3,
            firstAired: AIRED,
          }),
        ],
        anilist: [
          anilistInput(anime(21, { currentProgress: 5 }), { totalEpisodes: 24 }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(2);
  });

  test('an AniList entry that classifies to nothing does not suppress its Trakt twin', () => {
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(22, { externalIds: { trakt: 22, tmdb: 888 } }), {
            season: 1,
            number: 3,
            firstAired: AIRED,
          }),
        ],
        anilist: [
          // Hiatus: no pointer, no total → excluded.
          anilistInput(anime(22, { currentProgress: 5 }), { tmdbId: 888 }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.continueWatching[0].source).toBe('trakt');
  });
});

describe('computeUpNext — empty and degraded inputs (R12/R4)', () => {
  test('no inputs yields two empty sections, not an error', () => {
    expect(computeUpNext(inputs(), NOW)).toEqual({
      continueWatching: [],
      calendar: [],
    });
  });

  test('one provider failing still returns the other provider entries', () => {
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(30, { currentProgress: 1 }), { totalEpisodes: 12 }),
        ],
        errors: [{ provider: 'trakt', message: 'boom' }],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
  });
});

describe('calendarWeek — the week strip buckets (U8)', () => {
  function upcoming(id: number, month: number, day: number) {
    return computeUpNext(
      inputs({
        trakt: [
          traktInput(show(id), {
            season: 1,
            number: 2,
            firstAired: localInstant(2026, month, day, 12, 0),
          }),
        ],
      }),
      NOW,
    ).calendar;
  }

  test("today's already-aired episodes land on the today cell (not just upcoming)", () => {
    // The whole point of feeding the strip *both* sections: an episode that
    // aired earlier today is in Continue Watching, but the today cell must
    // still show it — a "This week" schedule that reads "nothing today" when
    // something aired today is wrong.
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(50), {
            season: 1,
            number: 3,
            firstAired: localInstant(2026, 7, 23, 9, 0), // aired 09:00 today
          }),
          traktInput(show(51), {
            season: 1,
            number: 2,
            firstAired: localInstant(2026, 7, 25, 12, 0), // upcoming
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1); // the aired one
    expect(data.calendar).toHaveLength(1); // the upcoming one

    const week = calendarWeek([...data.continueWatching, ...data.calendar], NOW);
    expect(week[0].entries.map((e) => e.item.externalIds.trakt)).toEqual([50]);
    expect(week[2].entries.map((e) => e.item.externalIds.trakt)).toEqual([51]);
  });

  test('an episode aired on a previous day has no cell in the future strip', () => {
    const data = computeUpNext(
      inputs({
        trakt: [
          traktInput(show(52), {
            season: 1,
            number: 3,
            firstAired: localInstant(2026, 7, 21, 12, 0), // two days ago
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    const week = calendarWeek([...data.continueWatching, ...data.calendar], NOW);
    expect(week.every((day) => day.entries.length === 0)).toBe(true);
  });

  test('the week always has one cell per window day, empty ones included', () => {
    const week = calendarWeek(upcoming(40, 7, 25), NOW);
    expect(week).toHaveLength(7);
    expect(week.map((day) => day.label).slice(0, 3)).toEqual([
      'Today',
      'Tomorrow',
      'Saturday',
    ]);
    expect(week[2].entries).toHaveLength(1); // 2026-07-25 is two days out
    expect(week[0].entries).toEqual([]);
  });

  test('day buckets come from the same local-day logic as the badges', () => {
    // An instant just past local midnight belongs to tomorrow's bucket, the
    // same day `formatRelativeDay` labels it with — no drift between them.
    const entries = upcoming(44, 7, 24);
    const week = calendarWeek(entries, NOW);
    expect(week[1].entries).toHaveLength(1);
    expect(week[0].entries).toEqual([]);
  });
});
