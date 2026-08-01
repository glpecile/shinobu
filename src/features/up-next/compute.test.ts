import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

import {
  calendarWeek,
  computeUpNext,
  selectUpNextPool,
  UP_NEXT_POOL_SIZE,
} from './compute';
import { entryLabel } from './entry';
import type {
  AniListUpNextInput,
  CalendarUpNextInput,
  ProgressUpNextInput,
  ReleaseUpNextInput,
  UpNextEntry,
  UpNextEpisode,
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
  return {
    progress: [],
    calendar: [],
    releases: [],
    anilist: [],
    errors: [],
    ...overrides,
  };
}

/**
 * Defaults to `trakt`, so every pre-0034 case below asserts the provider-keyed
 * retype changed nothing for the source that already existed — the Simkl cases
 * opt in explicitly (the same discipline as `anilistInput`'s CURRENT default).
 */
function progressInput(
  item: NormalizedMediaItem,
  nextEpisode?: ProgressUpNextInput['nextEpisode'],
  overrides: Partial<ProgressUpNextInput> = {},
): ProgressUpNextInput {
  return {
    item,
    source: 'trakt',
    ...(nextEpisode != null ? { nextEpisode } : {}),
    ...overrides,
  };
}

/**
 * Defaults to CURRENT, so every pre-0030 case below asserts the widened list
 * read changed nothing for the status that already existed — the PLANNING
 * cases opt in explicitly.
 */
function anilistInput(
  item: NormalizedMediaItem,
  overrides: Partial<AniListUpNextInput> = {},
): AniListUpNextInput {
  return {
    item,
    status: 'CURRENT',
    nextAiring: null,
    totalEpisodes: null,
    ...overrides,
  };
}

/**
 * A tracker's calendar row (plan 0030 KTD-2): the show plus the episode airing
 * in the window — no progress and no pool, which is exactly why it can speak
 * for shows the pool fan never reaches. Trakt-sourced by default, mirroring
 * `progressInput`.
 */
function calendarInput(
  item: NormalizedMediaItem,
  episode: CalendarUpNextInput['episode'],
  overrides: Partial<CalendarUpNextInput> = {},
): CalendarUpNextInput {
  return { item, source: 'trakt', episode, ...overrides };
}

function film(
  traktId: number,
  overrides: Partial<NormalizedMediaItem> = {},
): NormalizedMediaItem {
  return {
    id: `trakt-${traktId}`,
    title: `Film ${traktId}`,
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-20T12:00:00.000Z',
    externalIds: { trakt: traktId },
    ...overrides,
  };
}

function releaseInput(
  item: NormalizedMediaItem,
  kind: ReleaseUpNextInput['kind'],
  date: string,
  source: ReleaseUpNextInput['source'] = 'trakt',
): ReleaseUpNextInput {
  return { item, kind, date, source };
}

/** The release arm's payload, narrowed — the mirror of `episodeOf`. */
function releaseOf(entry: UpNextEntry) {
  if (entry.kind !== 'release') {
    throw new Error(`expected a release entry, got ${entry.kind}`);
  }
  return entry.release;
}

/**
 * Asserting on an episode payload means narrowing the union first — and failing
 * loudly rather than silently passing if a source ever starts emitting the
 * other arm where an episode is expected.
 */
function episodeOf(entry: UpNextEntry): UpNextEpisode {
  if (entry.kind !== 'episode') {
    throw new Error(`expected an episode entry, got ${entry.kind}`);
  }
  return entry.episode;
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
        progress: [
          progressInput(show(1), {
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

  // The double-source removal (plan 0030 U4): the pool fan's pointer used to be
  // Calendar's Trakt source *as well as* Continue Watching's. It no longer is —
  // `/calendars/my/shows` states the same airing for a strictly larger set of
  // shows, and emitting it from both would double the pooled ones.
  test('an unaired pooled pointer no longer contributes a Calendar entry', () => {
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(show(2), {
            season: 3,
            number: 1,
            firstAired: localInstant(2026, 7, 25, 21, 0),
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('an ended or unscheduled show (no next_episode) is excluded', () => {
    const data = computeUpNext(inputs({ progress: [progressInput(show(3))] }), NOW);
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('a next episode with no air date at all is excluded from both', () => {
    const data = computeUpNext(
      inputs({
        progress: [progressInput(show(4), { season: 1, number: 9, firstAired: null })],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('Continue Watching is ordered most recently watched first', () => {
    const aired = localInstant(2026, 7, 20, 12, 0);
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(show(9, { lastUpdated: '2026-07-18T00:00:00.000Z' }), {
            season: 1,
            number: 2,
            firstAired: aired,
          }),
          progressInput(show(10, { lastUpdated: '2026-07-22T00:00:00.000Z' }), {
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

describe('computeUpNext — the Trakt my-calendars source (U4/KTD-2)', () => {
  test('a watchlisted, never-watched show reaches Calendar', () => {
    // No pool entry exists for it at all: the user has watched nothing, so
    // `progress/watched` has no pointer to give. This is the case the old
    // source could not express.
    const data = computeUpNext(
      inputs({
        calendar: [
          calendarInput(show(100, { currentProgress: 0 }), {
            season: 1,
            number: 1,
            title: 'Pilot',
            firstAired: localInstant(2026, 7, 25, 21, 0),
          }),
        ],
      }),
      NOW,
    );
    expect(data.calendar).toHaveLength(1);
    expect(data.calendar[0]).toMatchObject({
      source: 'trakt',
      status: 'upcoming',
      episode: { season: 1, number: 1, title: 'Pilot' },
    });
    // Never started, so never quick-loggable (R4).
    expect(data.continueWatching).toHaveLength(0);
  });

  test('shows past the old 20-show pool cap reach Calendar', () => {
    // The fixed limitation: the calendar endpoint answers in one call for every
    // watched-or-watchlisted show, so nothing is dropped for lack of a request
    // budget the way `UP_NEXT_POOL_SIZE` drops shows from Continue Watching.
    const airing = Array.from({ length: UP_NEXT_POOL_SIZE + 5 }, (_, index) =>
      calendarInput(show(200 + index), {
        season: 1,
        number: 2,
        firstAired: localInstant(2026, 7, 25, 21, 0),
      }),
    );
    const data = computeUpNext(inputs({ calendar: airing }), NOW);
    expect(data.calendar).toHaveLength(UP_NEXT_POOL_SIZE + 5);
  });

  test('an aired next episode reaches Continue Watching and not Calendar', () => {
    // Both sources speak for the same show: the pool knows episode 3 aired
    // yesterday, the calendar knows episode 4 airs Saturday. Two episodes, two
    // sections — and neither one duplicated into the other.
    const item = show(101, { externalIds: { trakt: 101, tmdb: 909 } });
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(item, {
            season: 1,
            number: 3,
            firstAired: localInstant(2026, 7, 22, 21, 0),
          }),
        ],
        calendar: [
          calendarInput(item, {
            season: 1,
            number: 4,
            firstAired: localInstant(2026, 7, 25, 21, 0),
          }),
        ],
      }),
      NOW,
    );
    expect(episodeOf(data.continueWatching[0]).number).toBe(3);
    expect(data.continueWatching).toHaveLength(1);
    expect(episodeOf(data.calendar[0]).number).toBe(4);
    expect(data.calendar).toHaveLength(1);
  });

  test('an airing the calendar reports for earlier today is not Continue Watching', () => {
    // The calendar window opens at local midnight, so it reports this morning's
    // airings too — but it speaks for shows the user has never opened, and
    // promoting one to `aired` would offer a quick-log for a show with no
    // progress behind it (R4).
    const data = computeUpNext(
      inputs({
        calendar: [
          calendarInput(show(102, { currentProgress: 0 }), {
            season: 1,
            number: 1,
            firstAired: localInstant(2026, 7, 23, 9, 0),
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('an episode further out than the window is not in Calendar', () => {
    const data = computeUpNext(
      inputs({
        calendar: [
          calendarInput(show(103), {
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
        calendar: [
          calendarInput(show(104), {
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
        calendar: [
          calendarInput(show(105), {
            season: 1,
            number: 2,
            firstAired: localInstant(2026, 7, 27, 12, 0),
          }),
          calendarInput(show(106), {
            season: 1,
            number: 5,
            firstAired: localInstant(2026, 7, 24, 12, 0),
          }),
        ],
      }),
      NOW,
    );
    expect(data.calendar.map((entry) => entry.item.externalIds.trakt)).toEqual([
      106, 105,
    ]);
  });

  test('an AniList entry still suppresses its Trakt calendar twin', () => {
    const data = computeUpNext(
      inputs({
        calendar: [
          calendarInput(show(107, { externalIds: { trakt: 107, tmdb: 4242 } }), {
            season: 2,
            number: 3,
            firstAired: localInstant(2026, 7, 25, 12, 0),
          }),
        ],
        anilist: [
          anilistInput(anime(107, { currentProgress: 5 }), {
            nextAiring: { episode: 6, airingAt: localInstant(2026, 7, 25, 12, 0) },
            totalEpisodes: 12,
            tmdbId: 4242,
          }),
        ],
      }),
      NOW,
    );
    expect(data.calendar).toHaveLength(1);
    expect(data.calendar[0].source).toBe('anilist');
  });
});

describe('computeUpNext — film releases (U5/R3)', () => {
  test('one film yields one entry per release kind, labelled distinctly', () => {
    const item = film(300, { externalIds: { trakt: 300, tmdb: 5000 } });
    const data = computeUpNext(
      inputs({
        releases: [
          releaseInput(item, 'theatrical', '2026-07-24'),
          releaseInput(item, 'digital', '2026-07-26'),
        ],
      }),
      NOW,
    );
    expect(data.calendar).toHaveLength(2);
    expect(data.calendar.map(releaseOf)).toEqual([
      { kind: 'theatrical', date: '2026-07-24' },
      { kind: 'digital', date: '2026-07-26' },
    ]);
    // Two rows for one film must not collide as list keys, and must not read
    // the same on screen.
    expect(data.calendar.map((entry) => entry.id)).toEqual([
      'trakt-300-theatrical',
      'trakt-300-digital',
    ]);
    expect(data.calendar.map(entryLabel)).toEqual(['In theaters', 'Streaming']);
  });

  test('a duplicate theatrical row across sources collapses, the digital one survives', () => {
    // The same film on the Trakt and Letterboxd watchlists: one TMDB id, but
    // (id, kind) is the key — collapsing on the id alone would swallow the
    // digital row (KTD-6).
    const ids = { trakt: 301, tmdb: 5001 };
    const data = computeUpNext(
      inputs({
        releases: [
          releaseInput(film(301, { externalIds: ids }), 'theatrical', '2026-07-24'),
          releaseInput(
            film(301, { externalIds: ids, title: 'Film 301 (Letterboxd)' }),
            'theatrical',
            '2026-07-24',
            'letterboxd',
          ),
          releaseInput(film(301, { externalIds: ids }), 'digital', '2026-07-27'),
        ],
      }),
      NOW,
    );
    expect(data.calendar.map(releaseOf).map((release) => release.kind)).toEqual([
      'theatrical',
      'digital',
    ]);
    // First one in wins, so the row keeps the source that stated it first.
    expect(data.calendar[0].source).toBe('trakt');
  });

  test('a film with no TMDB id is never collapsed against another', () => {
    const data = computeUpNext(
      inputs({
        releases: [
          releaseInput(film(302), 'theatrical', '2026-07-24'),
          releaseInput(film(303), 'theatrical', '2026-07-24'),
        ],
      }),
      NOW,
    );
    expect(data.calendar).toHaveLength(2);
  });

  test('a film released before today contributes nothing', () => {
    const data = computeUpNext(
      inputs({
        releases: [
          releaseInput(film(304), 'theatrical', '2026-07-22'),
          releaseInput(film(305), 'digital', '2026-07-01'),
        ],
      }),
      NOW,
    );
    expect(data.calendar).toEqual([]);
    // And a release never lands in the quick-log section, released or not (R5).
    expect(data.continueWatching).toEqual([]);
  });

  test('a film released today still shows on the today cell', () => {
    const data = computeUpNext(
      inputs({ releases: [releaseInput(film(306), 'theatrical', '2026-07-23')] }),
      NOW,
    );
    expect(data.calendar).toHaveLength(1);
    expect(data.continueWatching).toEqual([]);
  });

  test('a film beyond the window is out, exactly like an episode', () => {
    const data = computeUpNext(
      inputs({ releases: [releaseInput(film(307), 'digital', '2026-07-30')] }),
      NOW,
    );
    expect(data.calendar).toEqual([]);
  });

  test('Calendar interleaves releases and episodes strictly by instant', () => {
    // The ordering trap: a release is a bare local day and an episode a UTC
    // instant, so comparing the raw strings would file the Saturday release
    // ahead of Friday's late-evening episode.
    const data = computeUpNext(
      inputs({
        calendar: [
          calendarInput(show(310), {
            season: 1,
            number: 2,
            firstAired: localInstant(2026, 7, 24, 23, 30), // Fri, late
          }),
          calendarInput(show(311), {
            season: 1,
            number: 2,
            firstAired: localInstant(2026, 7, 26, 12, 0), // Sun
          }),
        ],
        releases: [
          releaseInput(film(312), 'theatrical', '2026-07-25'), // Sat
          releaseInput(film(313), 'digital', '2026-07-24'), // Fri, midnight
        ],
      }),
      NOW,
    );
    expect(data.calendar.map((entry) => entry.item.externalIds.trakt)).toEqual([
      313, 310, 312, 311,
    ]);
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
        progress: [
          progressInput(show(11), {
            season: 1,
            number: 4,
            firstAired: '2026-07-24T00:00:00.000+09:00', // 2026-07-23T15:00Z
          }),
        ],
        calendar: [
          calendarInput(show(12), {
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
        progress: [
          progressInput(show(13), {
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
        calendar: [
          calendarInput(show(14), { season: 1, number: 2, firstAired: '2026-07-24' }),
        ],
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
    expect(episodeOf(data.continueWatching[0]).season).toBeUndefined();
    expect(episodeOf(data.continueWatching[0]).firstAired).toBeUndefined();
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
    expect(episodeOf(data.calendar[0]).number).toBe(6);
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
    expect(episodeOf(data.continueWatching[0])).toEqual({ number: 4 });
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
    expect(episodeOf(entry).season).toBeUndefined();
    expect(episodeOf(entry).number).toBe(1);
    expect(entry.id).toBe('anilist-9-e1');
  });
});

/**
 * Plan 0030 KTD-3, the regression guard the plan names explicitly. One list
 * request now carries plan-to-watch entries as well (R12), and PLANNING entries
 * sit at progress 0 — which the classifier above reads as "four episodes behind
 * and every one of them already out". Only the status gate keeps that out of
 * Continue Watching, and nothing about it is visible at the type level, so
 * these cases are the whole safety net.
 */
describe('computeUpNext — AniList PLANNING entries (KTD-3)', () => {
  test('a PLANNING series premiering this week reaches Calendar', () => {
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(30, { currentProgress: 0 }), {
            status: 'PLANNING',
            // Nothing has aired yet, so the pointer still sits on episode 1 —
            // the one shape where a plan-to-watch title is a schedule event.
            nextAiring: { episode: 1, airingAt: localInstant(2026, 7, 25, 12, 0) },
            totalEpisodes: 12,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(1);
    expect(data.calendar[0]).toMatchObject({
      source: 'anilist',
      status: 'upcoming',
    });
    expect(episodeOf(data.calendar[0]).number).toBe(1);
  });

  test('a PLANNING series already mid-run is excluded from both sections', () => {
    // The flood case. progress 0 → next = 1, four episodes below the pointer,
    // which classifies as `aired` by construction. Un-gated this puts the
    // user's entire plan-to-watch backlog into Continue Watching — and it must
    // not land in Calendar either: episode 1 airing weeks ago is not a
    // calendar event for a show that was never started.
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(31, { currentProgress: 0 }), {
            status: 'PLANNING',
            nextAiring: { episode: 5, airingAt: localInstant(2026, 7, 25, 12, 0) },
            totalEpisodes: 12,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('the same entry marked CURRENT is unaffected by the gate', () => {
    // Byte-identical fixture to the flood case with one field changed: the gate
    // keys off the status alone and leaves every pre-0030 classification as it
    // was — someone four episodes behind is exactly who Continue Watching is
    // for.
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(31, { currentProgress: 0 }), {
            status: 'CURRENT',
            nextAiring: { episode: 5, airingAt: localInstant(2026, 7, 25, 12, 0) },
            totalEpisodes: 12,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.continueWatching[0].status).toBe('aired');
    expect(episodeOf(data.continueWatching[0]).number).toBe(1);
  });

  test('a finished PLANNING series contributes nothing', () => {
    // No pointer + a known total is "aired by construction" for a CURRENT
    // entry. As a backlog item it has no airing ahead of it at all, so it
    // belongs to neither section.
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(32, { currentProgress: 0 }), {
            status: 'PLANNING',
            totalEpisodes: 26,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('a PLANNING pointer whose instant has already passed is excluded', () => {
    // `hasAired` wins over the arithmetic at the frontier, so this classifies
    // as `aired` — the one PLANNING path into Continue Watching that does not
    // go through the "below the pointer" branch.
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(33, { currentProgress: 0 }), {
            status: 'PLANNING',
            nextAiring: { episode: 1, airingAt: localInstant(2026, 7, 22, 12, 0) },
            totalEpisodes: 12,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('a gated PLANNING entry leaves its Trakt twin standing', () => {
    // Dedupe suppresses a Trakt card only for AniList entries that *survived*.
    // A gated PLANNING entry must not take the Trakt row down with it —
    // otherwise adding a show to the AniList plan list would silently delete a
    // card the user is actively watching on Trakt.
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(show(34, { externalIds: { trakt: 34, tmdb: 777 } }), {
            season: 1,
            number: 3,
            firstAired: localInstant(2026, 7, 21, 12, 0),
          }),
        ],
        anilist: [
          anilistInput(anime(34, { currentProgress: 0 }), {
            status: 'PLANNING',
            nextAiring: { episode: 5, airingAt: localInstant(2026, 7, 25, 12, 0) },
            totalEpisodes: 12,
            tmdbId: 777,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.continueWatching[0].source).toBe('trakt');
  });
});

/**
 * Plan 0031 R9. The gate above was written for PLANNING entries the *user* had
 * already made; this app now **creates** them — `planOnAniList` writes
 * `status: PLANNING` on every AniList watchlist add
 * (`src/lib/providers/anilist/writes.ts`, plan 0031 KTD-2). So the hole
 * `docs/solutions/anilist-shared-list-query-status-gate.md` describes is no
 * longer bounded by how much plan-to-watch the user happened to have: adding a
 * long-running series you have never started is now a one-tap action, and every
 * one of those entries arrives at `computeUpNext` at progress 0 with episodes
 * long since aired — the exact flood shape.
 *
 * Watchlist is not the agenda. This asserts it as an absence across the whole
 * result, not per section, so a future third section cannot quietly become the
 * new leak.
 */
describe('computeUpNext — watchlist adds never reach the agenda (plan 0031 R9)', () => {
  test('a series watchlisted mid-run appears nowhere, least of all Continue Watching', () => {
    const data = computeUpNext(
      inputs({
        anilist: [
          // Exactly what a fresh `planOnAniList` write reads back: PLANNING,
          // progress 0, and the run already 11 episodes deep.
          anilistInput(anime(4031, { currentProgress: 0 }), {
            status: 'PLANNING',
            nextAiring: { episode: 12, airingAt: localInstant(2026, 7, 25, 12, 0) },
            totalEpisodes: 24,
          }),
        ],
      }),
      NOW,
    );
    const everywhere = [...data.continueWatching, ...data.calendar];
    expect(everywhere.filter((entry) => entry.item.id === 'anilist-4031')).toEqual([]);
    expect(data.continueWatching).toHaveLength(0);
    expect(everywhere).toHaveLength(0);
  });

  test('a whole watchlisted backlog cannot flood Continue Watching', () => {
    // The volume half of the same claim: ten adds, ten entries, zero rows.
    const data = computeUpNext(
      inputs({
        anilist: Array.from({ length: 10 }, (_, index) =>
          anilistInput(anime(4100 + index, { currentProgress: 0 }), {
            status: 'PLANNING',
            nextAiring: {
              episode: 5 + index,
              airingAt: localInstant(2026, 7, 25, 12, 0),
            },
            totalEpisodes: 24,
          }),
        ),
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });
});

describe('computeUpNext — cross-provider dedupe (R5)', () => {
  const AIRED = localInstant(2026, 7, 21, 12, 0);

  test('the same TMDB id from both providers yields one AniList-sourced entry', () => {
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(show(20, { externalIds: { trakt: 20, tmdb: 555 } }), {
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
    expect(episodeOf(data.continueWatching[0]).number).toBe(6);
  });

  test('an unresolvable TMDB id leaves the duplicate standing (best-effort)', () => {
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(show(21, { externalIds: { trakt: 21, tmdb: 777 } }), {
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
        progress: [
          progressInput(show(22, { externalIds: { trakt: 22, tmdb: 888 } }), {
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

/**
 * Plan 0034 U8/R9: the Simkl legs ride the same provider-tagged inputs as
 * Trakt's, so classification (instants through `hasAired`, never calendar
 * dates) is identical by construction — these cases pin the parts that are
 * Simkl-specific: the null-date arithmetic, the finale flag, absolute anime
 * numbering, and the KTD-10 precedence when both trackers speak.
 */
function simklShow(
  simklId: number,
  overrides: Partial<NormalizedMediaItem> = {},
): NormalizedMediaItem {
  return {
    id: `simkl-${simklId}`,
    title: `Simkl Show ${simklId}`,
    coverImage: '',
    type: 'TV',
    currentProgress: 4,
    progressUnit: 'episode',
    lastUpdated: '2026-07-21T12:00:00.000Z',
    externalIds: { simkl: simklId },
    ...overrides,
  };
}

describe('computeUpNext — Simkl progress leg (plan 0034 U8/R9)', () => {
  test('a Simkl-only user gets a populated Continue Watching from aired pointers', () => {
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(
            simklShow(900),
            {
              season: 1,
              number: 5,
              title: 'The Fifth',
              firstAired: localInstant(2026, 7, 22, 21, 0),
            },
            { source: 'simkl' },
          ),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.continueWatching[0]).toMatchObject({
      source: 'simkl',
      status: 'aired',
      episode: { season: 1, number: 5, title: 'The Fifth' },
    });
  });

  test('an instant in +14:00 that has already passed counts as aired (instants, not dates)', () => {
    // Mirror of the Trakt date-line case: the pointer's calendar date reads as
    // "tomorrow" at its origin offset, but the absolute instant is in the past.
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(
            simklShow(901),
            {
              season: 1,
              number: 4,
              firstAired: '2026-07-24T10:00:00.000+14:00', // 2026-07-23T20:00Z
            },
            { source: 'simkl' },
          ),
        ],
      }),
      new Date('2026-07-23T21:00:00.000Z'),
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.calendar).toHaveLength(0);
  });

  test('a pre-window instant still classifies as aired — no calendar file needed', () => {
    // Aired two months before NOW — far outside Simkl's rolling ~34-day CDN
    // window. `next_watch_info` carries the instant, so the catch-up case
    // never depends on the calendar files at all (the U8 pre-window choice).
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(
            simklShow(902),
            { season: 2, number: 1, firstAired: localInstant(2026, 5, 20, 21, 0) },
            { source: 'simkl' },
          ),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.continueWatching[0].status).toBe('aired');
  });

  test('a null-date pointer proven aired by counts degrades to a progress-only entry', () => {
    // Simkl knows the episode but not its air date, and the show is absent
    // from the calendar files — the plan's "degrades to progress-only, never
    // hidden" case. The entry carries no instant, like an AniList back-episode.
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(
            simklShow(903),
            { season: 1, number: 5, firstAired: null },
            { source: 'simkl', nextEpisodeAiredByCount: true },
          ),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(episodeOf(data.continueWatching[0]).firstAired).toBeUndefined();
    expect(data.calendar).toHaveLength(0);
  });

  test('a null-date pointer without count proof is excluded, exactly like Trakt', () => {
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(
            simklShow(904),
            { season: 1, number: 5, firstAired: null },
            { source: 'simkl' },
          ),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });

  test('a Simkl anime pointer carries no season, and the id reflects it', () => {
    // Simkl numbers anime absolutely (the AniDB convention) — no fabricated
    // season, the same plan-0027 rule AniList entries follow.
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(
            simklShow(905, { type: 'ANIME' }),
            { number: 13, firstAired: localInstant(2026, 7, 22, 12, 0) },
            { source: 'simkl' },
          ),
        ],
      }),
      NOW,
    );
    const entry = data.continueWatching[0];
    expect(episodeOf(entry).season).toBeUndefined();
    expect(entry.id).toBe('simkl-905-e13');
  });
});

describe('computeUpNext — Simkl calendar leg (plan 0034 KTD-4)', () => {
  test('an upcoming tracked airing reaches Calendar, finale flag intact', () => {
    const data = computeUpNext(
      inputs({
        calendar: [
          calendarInput(
            simklShow(910),
            {
              season: 2,
              number: 10,
              title: 'Finale',
              firstAired: localInstant(2026, 7, 25, 21, 0),
            },
            { source: 'simkl', finale: 'season' },
          ),
        ],
      }),
      NOW,
    );
    expect(data.calendar).toHaveLength(1);
    expect(data.calendar[0]).toMatchObject({
      source: 'simkl',
      status: 'upcoming',
      episode: { season: 2, number: 10, finale: 'season' },
    });
    expect(data.continueWatching).toHaveLength(0);
  });

  test('an airing from earlier today is dropped, not promoted to aired (R4)', () => {
    const data = computeUpNext(
      inputs({
        calendar: [
          calendarInput(
            simklShow(911, { currentProgress: 0 }),
            { season: 1, number: 1, firstAired: localInstant(2026, 7, 23, 9, 0) },
            { source: 'simkl' },
          ),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(0);
  });
});

describe('computeUpNext — cross-tracker dedupe (plan 0034 KTD-10/R10)', () => {
  const TRAKT_AIRED = localInstant(2026, 7, 21, 12, 0);
  const SIMKL_AIRED = localInstant(2026, 7, 22, 21, 0);

  test('the same show on both trackers yields one row, with Simkl’s air time', () => {
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(show(80, { externalIds: { trakt: 80, tmdb: 6000 } }), {
            season: 1,
            number: 3,
            firstAired: TRAKT_AIRED,
          }),
          progressInput(
            simklShow(980, { externalIds: { simkl: 980, tmdb: 6000 } }),
            { season: 1, number: 3, firstAired: SIMKL_AIRED },
            { source: 'simkl' },
          ),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.continueWatching[0].source).toBe('simkl');
    expect(episodeOf(data.continueWatching[0]).firstAired).toBe(SIMKL_AIRED);
  });

  test('the same upcoming airing from both calendars is one Simkl row', () => {
    const airing = { season: 1, number: 4, firstAired: localInstant(2026, 7, 25, 21, 0) };
    const data = computeUpNext(
      inputs({
        calendar: [
          calendarInput(show(81, { externalIds: { trakt: 81, tmdb: 6001 } }), airing),
          calendarInput(
            simklShow(981, { externalIds: { simkl: 981, tmdb: 6001 } }),
            airing,
            { source: 'simkl' },
          ),
        ],
      }),
      NOW,
    );
    expect(data.calendar).toHaveLength(1);
    expect(data.calendar[0].source).toBe('simkl');
  });

  test('precedence is per section: a Simkl upcoming row leaves Trakt’s aired row standing', () => {
    // Trakt knows the user is an episode behind; Simkl only states next week's
    // airing. Keying the collapse on (tmdb, status) keeps both sections whole
    // instead of letting the upcoming row delete the quick-loggable one.
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(show(82, { externalIds: { trakt: 82, tmdb: 6002 } }), {
            season: 1,
            number: 3,
            firstAired: TRAKT_AIRED,
          }),
        ],
        calendar: [
          calendarInput(
            simklShow(982, { externalIds: { simkl: 982, tmdb: 6002 } }),
            { season: 1, number: 4, firstAired: localInstant(2026, 7, 25, 21, 0) },
            { source: 'simkl' },
          ),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.continueWatching[0].source).toBe('trakt');
    expect(data.calendar).toHaveLength(1);
    expect(data.calendar[0].source).toBe('simkl');
  });

  test('no TMDB id leaves the duplicate standing (best-effort, like R5)', () => {
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(show(83), { season: 1, number: 3, firstAired: TRAKT_AIRED }),
          progressInput(
            simklShow(983),
            { season: 1, number: 3, firstAired: SIMKL_AIRED },
            { source: 'simkl' },
          ),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(2);
  });

  test('an AniList entry still wins over its Simkl twin', () => {
    // The provider precedence chain end to end: AniList carries the user's
    // anime progress and its write path advances the entry, so it outranks
    // both trackers — Simkl outranking Trakt must not change that.
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(
            simklShow(984, { type: 'ANIME', externalIds: { simkl: 984, tmdb: 6004 } }),
            { number: 6, firstAired: SIMKL_AIRED },
            { source: 'simkl' },
          ),
        ],
        anilist: [
          anilistInput(anime(984, { currentProgress: 5 }), {
            totalEpisodes: 24,
            tmdbId: 6004,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.continueWatching[0].source).toBe('anilist');
  });

  test('a duplicate release row keeps the first source in — Simkl when it leads the array', () => {
    // `fetchUpNextInputs` concatenates Simkl's release rows first for exactly
    // this reason: `dedupeReleases` keeps the first `(tmdb, kind)` row it sees.
    const ids = { simkl: 985, tmdb: 6005 };
    const data = computeUpNext(
      inputs({
        releases: [
          releaseInput(
            film(985, { id: 'simkl-985', externalIds: ids }),
            'theatrical',
            '2026-07-24',
            'simkl',
          ),
          releaseInput(
            film(985, { externalIds: { trakt: 985, tmdb: 6005 } }),
            'theatrical',
            '2026-07-24',
          ),
        ],
      }),
      NOW,
    );
    expect(data.calendar).toHaveLength(1);
    expect(data.calendar[0].source).toBe('simkl');
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
        calendar: [
          calendarInput(show(id), {
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
        progress: [
          progressInput(show(50), {
            season: 1,
            number: 3,
            firstAired: localInstant(2026, 7, 23, 9, 0), // aired 09:00 today
          }),
        ],
        calendar: [
          calendarInput(show(51), {
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
        progress: [
          progressInput(show(52), {
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

  test('a date-only film release buckets on its local day, not the UTC one', () => {
    // The union's other arm through the same accessor: a release states a bare
    // calendar day, and reading it as UTC midnight would land it a cell early
    // for every user west of Greenwich.
    const release: UpNextEntry = {
      kind: 'release',
      id: 'trakt-60-theatrical',
      item: show(60, { type: 'MOVIE', title: 'Film 60' }),
      release: { kind: 'theatrical', date: '2026-07-24' },
      status: 'upcoming',
      source: 'trakt',
    };
    const week = calendarWeek([release], NOW);
    expect(week[1].entries.map((entry) => entry.id)).toEqual([
      'trakt-60-theatrical',
    ]);
    expect(week[0].entries).toEqual([]);
  });
});
