import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';
import { normalizeCurrentAnimeEntry } from '@/lib/providers/anilist/normalize';

import {
  calendarWeek,
  nextSplitChange,
  computeUpNext,
  selectUpNextPool,
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

const NOW = new Date(2026, 6, 23, 20, 0);

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

function releaseOf(entry: UpNextEntry) {
  if (entry.kind !== 'release') {
    throw new Error(`expected a release entry, got ${entry.kind}`);
  }
  return entry.release;
}

function episodeOf(entry: UpNextEntry): UpNextEpisode {
  if (entry.kind !== 'episode') {
    throw new Error(`expected an episode entry, got ${entry.kind}`);
  }
  return entry.episode;
}

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

function upcomingAt(id: number, instant: string): UpNextEntry[] {
  return computeUpNext(
    inputs({ calendar: [calendarInput(show(id), { season: 1, number: 2, firstAired: instant })] }),
    NOW,
  ).calendar;
}

describe('selectUpNextPool', () => {
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

  test('Continue Watching leads with new episodes, then most recently watched', () => {
    const backlog = localInstant(2026, 7, 10, 12, 0);
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(show(9, { lastUpdated: '2026-07-18T00:00:00.000Z' }), {
            season: 1,
            number: 2,
            firstAired: backlog,
          }),
          progressInput(show(10, { lastUpdated: '2026-07-22T00:00:00.000Z' }), {
            season: 1,
            number: 3,
            firstAired: backlog,
          }),
          progressInput(show(11, { lastUpdated: '2026-07-01T00:00:00.000Z' }), {
            season: 2,
            number: 1,
            firstAired: localInstant(2026, 7, 20, 12, 0),
          }),
          progressInput(show(12, { lastUpdated: '2026-07-01T00:00:00.000Z' }), {
            season: 2,
            number: 1,
            firstAired: localInstant(2026, 7, 22, 12, 0),
          }),
        ],
      }),
      NOW,
    );
    expect(
      data.continueWatching.map((entry) => entry.item.externalIds.trakt),
    ).toEqual([12, 11, 10, 9]);
  });
});

describe('computeUpNext — the Trakt my-calendars source (U4/KTD-2)', () => {
  test('an airing the calendar reports for earlier today is not Continue Watching', () => {
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
            firstAired: localInstant(2026, 7, 30, 12, 0),
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
    expect(data.calendar.map((entry) => entry.id)).toEqual([
      'trakt-300-theatrical',
      'trakt-300-digital',
    ]);
    expect(data.calendar.map(entryLabel)).toEqual(['In theaters', 'Streaming']);
  });

  test('a duplicate theatrical row across sources collapses, the digital one survives', () => {
    const ids = { trakt: 301, tmdb: 5001 };
    const data = computeUpNext(
      inputs({
        releases: [
          releaseInput(
            film(301, { id: 'letterboxd-film-301', externalIds: ids, title: 'Film 301 (Letterboxd)' }),
            'theatrical',
            '2026-07-24',
            'letterboxd',
          ),
          releaseInput(film(301, { externalIds: ids }), 'theatrical', '2026-07-24'),
          releaseInput(film(301, { externalIds: ids }), 'digital', '2026-07-27'),
        ],
      }),
      NOW,
    );
    expect(data.calendar.map(releaseOf).map((release) => release.kind)).toEqual([
      'theatrical',
      'digital',
    ]);
    expect(data.calendar[0].source).toBe('letterboxd');
    expect(data.calendar.map((entry) => entry.twinIds)).toEqual([
      ['trakt-301'],
      ['letterboxd-film-301'],
    ]);
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

  test('Calendar interleaves releases and episodes strictly by instant', () => {
    const data = computeUpNext(
      inputs({
        calendar: [
          calendarInput(show(310), {
            season: 1,
            number: 2,
            firstAired: localInstant(2026, 7, 24, 23, 30),
          }),
          calendarInput(show(311), {
            season: 1,
            number: 2,
            firstAired: localInstant(2026, 7, 26, 12, 0),
          }),
        ],
        releases: [
          releaseInput(film(312), 'theatrical', '2026-07-25'),
          releaseInput(film(313), 'digital', '2026-07-24'),
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
    const now = new Date('2026-07-23T23:00:00.000Z');
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(show(11), {
            season: 1,
            number: 4,
            firstAired: '2026-07-24T00:00:00.000+09:00',
          }),
        ],
        calendar: [
          calendarInput(show(12), {
            season: 1,
            number: 4,
            firstAired: '2026-07-24T09:00:00.000+09:00',
          }),
        ],
      }),
      now,
    );
    expect(
      data.continueWatching.map((entry) => entry.item.externalIds.trakt),
    ).toEqual([11]);
    expect(data.calendar.map((entry) => entry.item.externalIds.trakt)).toEqual([
      12,
    ]);
  });

  test('an instant that already passed counts as aired across a date-line boundary', () => {
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(show(13), {
            season: 1,
            number: 4,
            firstAired: '2026-07-24T10:00:00.000+14:00',
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
      episodesBehind: 3,
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
    expect(data.continueWatching[0]).toMatchObject({ episodesBehind: 9 });
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
});

describe('computeUpNext — AniList PLANNING entries (KTD-3)', () => {
  test('a planned sequel waits for its prequel to be completed without hiding current progress or its upcoming premiere', () => {
    const airingAt = Math.floor(NOW.getTime() / 1000);
    for (const status of ['CURRENT', null, 'COMPLETED']) {
      const sequel = normalizeCurrentAnimeEntry({
        status: 'PLANNING',
        progress: 0,
        media: {
          id: 40,
          episodes: 12,
          nextAiringEpisode: { episode: 1, airingAt },
          airingSchedule: { nodes: [{ episode: 1, airingAt }] },
          relations: {
            edges: [
              {
                relationType: 'PREQUEL',
                node: { type: 'ANIME', mediaListEntry: status == null ? null : { status } },
              },
              { relationType: 'SIDE_STORY', node: { type: 'ANIME' } },
              { relationType: 'PREQUEL', node: { type: 'MANGA' } },
            ],
          },
        },
      }, NOW.toISOString());
      const current = anilistInput(anime(38), { totalEpisodes: 24 });
      const data = inputs({ anilist: [current, sequel] });
      expect(computeUpNext(data, NOW).continueWatching.map((entry) => entry.item.id))
        .toEqual(status === 'COMPLETED' ? ['anilist-40', 'anilist-38'] : ['anilist-38']);
      expect(computeUpNext(data, new Date(NOW.getTime() - 1)).calendar.map((entry) => entry.item.id))
        .toEqual(['anilist-40']);
    }
  });

  test('a planned premiere moves from Calendar to Continue Watching until its window expires', () => {
    const airingAt = localInstant(2026, 7, 25, 12, 0);
    const planned = anilistInput(anime(30, { currentProgress: 0 }), {
      status: 'PLANNING',
      firstAired: airingAt,
      nextAiring: { episode: 1, airingAt },
      totalEpisodes: 12,
    });
    const data = computeUpNext(inputs({ anilist: [planned] }), NOW);
    expect(data.continueWatching).toHaveLength(0);
    expect(data.calendar).toHaveLength(1);
    expect(data.calendar[0]).toMatchObject({
      source: 'anilist',
      status: 'upcoming',
    });
    expect(episodeOf(data.calendar[0]).number).toBe(1);

    for (const nextAiring of [
      planned.nextAiring,
      { episode: 2, airingAt: localInstant(2026, 8, 1, 12, 0) },
      null,
    ]) {
      const refreshed = inputs({ anilist: [{ ...planned, nextAiring }] });
      const aired = computeUpNext(refreshed, new Date(airingAt));
      expect(aired.calendar).toEqual([]);
      expect(aired.continueWatching).toHaveLength(1);
      expect(aired.continueWatching[0]).toMatchObject({
        source: 'anilist',
        episode: { number: 1 },
      });
      expect(
        computeUpNext(refreshed, new Date(2026, 7, 1, 12, 0, 0, 1)).continueWatching,
      ).toEqual([]);
    }
  });

  test('a PLANNING series already mid-run is excluded from both sections', () => {
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

  test('a gated PLANNING entry leaves its Trakt twin standing', () => {
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
    expect(data.continueWatching[0].twinIds).toEqual(['trakt-20']);
    expect(episodeOf(data.continueWatching[0]).number).toBe(6);
    expect(data.continueWatching[0].item.externalIds.trakt).toBeUndefined();
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
});

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
  test('a null-date pointer proven aired by counts degrades to a progress-only entry', () => {
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

  test('a Simkl anime pointer carries no season, and the id reflects it', () => {
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
    expect(data.continueWatching[0].twinIds).toEqual(['trakt-80']);
    expect(episodeOf(data.continueWatching[0]).firstAired).toBe(SIMKL_AIRED);
  });

  test('precedence is per section: a Simkl upcoming row leaves Trakt’s aired row standing', () => {
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
});

describe('computeUpNext — cross-provider identity join (plan 0034 U9.5)', () => {
  test.each([
    { identity: 'MAL', ids: { mal: 55555 } },
    { identity: 'AniList', ids: { anilist: 901 } },
  ])('a shared $identity entry keeps the AniList card with the tracker’s write ids', ({ ids }) => {
    const item = anime(901, { externalIds: { anilist: 901, mal: 55555 } });
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(item, {
            nextAiring: { episode: 6, airingAt: localInstant(2026, 7, 25, 9, 30) },
            totalEpisodes: 12,
          }),
        ],
        calendar: [
          calendarInput(
            simklShow(9901, {
              title: 'Saga of Tanya the Evil Season 2',
              externalIds: { simkl: 9901, tmdb: 283428, tvdb: 459627, ...ids },
            }),
            { number: 5, firstAired: localInstant(2026, 7, 25, 9, 30) },
            { source: 'simkl' },
          ),
        ],
      }),
      NOW,
    );
    expect(data.calendar).toHaveLength(1);
    expect(data.calendar[0].source).toBe('anilist');
    expect(data.calendar[0].item.externalIds).toEqual({
      anilist: 901, mal: 55555, simkl: 9901, tmdb: 283428, tvdb: 459627,
    });
    expect(episodeOf(data.calendar[0]).number).toBe(6);
    expect(item.externalIds).toEqual({ anilist: 901, mal: 55555 });
  });
});

describe('calendarWeek — the week strip buckets (U8)', () => {
  test("today's already-aired episodes land on the today cell (not just upcoming)", () => {
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(show(50), {
            season: 1,
            number: 3,
            firstAired: localInstant(2026, 7, 23, 9, 0),
          }),
        ],
        calendar: [
          calendarInput(show(51), {
            season: 1,
            number: 2,
            firstAired: localInstant(2026, 7, 25, 12, 0),
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching).toHaveLength(1);
    expect(data.calendar).toHaveLength(1);

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
            firstAired: localInstant(2026, 7, 21, 12, 0),
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
    expect(week[2].entries).toHaveLength(1);
    expect(week[0].entries).toEqual([]);
  });

  test('a date-only film release buckets on its local day, not the UTC one', () => {
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

describe('episodesBehind', () => {
  test('a progress input count rides onto its aired entry verbatim', () => {
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(
            show(70),
            { season: 1, number: 5, firstAired: localInstant(2026, 7, 20) },
            { episodesBehind: 3 },
          ),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching[0]).toMatchObject({ episodesBehind: 3 });
  });

  test('a non-positive count is dropped rather than rendered as zero', () => {
    const data = computeUpNext(
      inputs({
        progress: [
          progressInput(
            show(71),
            { season: 1, number: 5, firstAired: localInstant(2026, 7, 20) },
            { episodesBehind: 0 },
          ),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching[0].kind).toBe('episode');
    expect(
      data.continueWatching[0].kind === 'episode'
        ? data.continueWatching[0].episodesBehind
        : null,
    ).toBeUndefined();
  });

  test('AniList at an aired pointer: exactly the one episode behind', () => {
    const data = computeUpNext(
      inputs({
        anilist: [
          anilistInput(anime(74), {
            nextAiring: { episode: 6, airingAt: localInstant(2026, 7, 22, 20) },
            totalEpisodes: 12,
          }),
        ],
      }),
      NOW,
    );
    expect(data.continueWatching[0]).toMatchObject({ episodesBehind: 1 });
  });
});

describe('nextSplitChange — what the section’s clock waits for', () => {
  test('the soonest upcoming airing, or local midnight when none comes first', () => {
    const tonight = localInstant(2026, 7, 23, 21, 30);
    expect(nextSplitChange(upcomingAt(90, tonight), NOW)).toBe(Date.parse(tonight));
    expect(nextSplitChange(upcomingAt(91, localInstant(2026, 7, 25, 9)), NOW)).toBe(
      new Date(2026, 6, 24).getTime(),
    );
  });
});
