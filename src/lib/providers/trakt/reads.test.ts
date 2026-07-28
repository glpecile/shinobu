import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { ProviderSession } from '@/types/session';
import {
  getHistory,
  getMyDvdCalendar,
  getMyMoviesCalendar,
  getMyShowsCalendar,
  getMyStreamingCalendar,
  getWatchedShows,
  getWatchlist,
  traktCalendarRange,
} from './reads';
import type { TokenStore, TraktDeps } from './deps';

const SESSION: ProviderSession = {
  accessToken: 'tok',
  refreshToken: 'r',
  expiresAt: Number.MAX_SAFE_INTEGER,
};

const TOKENS: TokenStore = {
  get: () => SESSION,
  set: () => {},
  clear: () => {},
};

function watchedShow(traktId: number) {
  return {
    plays: 1,
    last_watched_at: '2026-07-13T00:00:00.000Z',
    last_updated_at: '2026-07-13T00:00:00.000Z',
    show: { title: `Show ${traktId}`, ids: { trakt: traktId } },
    seasons: [{ number: 1, episodes: [{ number: 1, last_watched_at: '2026-07-13T00:00:00.000Z' }] }],
  };
}

/**
 * Serves /sync/watched/shows page by page (1-indexed) and records every
 * request URL, so the pagination loop's stop condition is observable.
 */
function pagedDeps(pages: unknown[][], requested: string[]) {
  const deps: TraktDeps = {
    tokens: TOKENS,
    clientId: 'id',
    clientSecret: 'secret',
    fetch: async (input) => {
      const url = new URL(String(input));
      requested.push(url.pathname + url.search);
      const page = Number(url.searchParams.get('page'));
      return new Response(JSON.stringify(pages[page - 1] ?? []), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
  return deps;
}

describe('getWatchedShows pagination (2026 Trakt API change)', () => {
  test('requests extended=progress and stops after a short page', async () => {
    const requested: string[] = [];
    // Page 1 full (100 items), page 2 short — loop must stop at page 2.
    const pages = [
      Array.from({ length: 100 }, (_, i) => watchedShow(i + 1)),
      [watchedShow(101)],
    ];
    const items = await Effect.runPromise(
      getWatchedShows(pagedDeps(pages, requested)),
    );

    expect(requested).toEqual([
      '/sync/watched/shows?extended=progress&page=1&limit=100',
      '/sync/watched/shows?extended=progress&page=2&limit=100',
    ]);
    expect(items).toHaveLength(101);
    // extended=progress seasons drive currentProgress (watched episode count).
    expect(items[0]?.currentProgress).toBe(1);
  });

  test('a single short page makes exactly one request', async () => {
    const requested: string[] = [];
    const items = await Effect.runPromise(
      getWatchedShows(pagedDeps([[watchedShow(1)]], requested)),
    );
    expect(requested).toHaveLength(1);
    expect(items).toHaveLength(1);
  });
});

/** Serves a fixed body/status for `/sync/history`, recording the request URL. */
function historyDeps(
  handler: (page: number) => Response,
  requested: string[],
): TraktDeps {
  return {
    tokens: TOKENS,
    clientId: 'id',
    clientSecret: 'secret',
    fetch: async (input) => {
      const url = new URL(String(input));
      requested.push(url.pathname + url.search);
      return handler(Number(url.searchParams.get('page')));
    },
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getHistory (diary source, plan 0016)', () => {
  test('requests one page at extended=full and normalizes rows', async () => {
    const requested: string[] = [];
    const deps = historyDeps(
      () =>
        json([
          {
            id: 1,
            watched_at: '2026-07-20T18:30:00.000Z',
            type: 'movie',
            movie: { title: 'Perfect Blue', year: 1997, ids: { trakt: 100 } },
          },
        ]),
      requested,
    );

    const entries = await Effect.runPromise(getHistory(deps, { page: 3 }));

    expect(requested).toEqual(['/sync/history?extended=full&page=3&limit=50']);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('trakt-1');
  });

  test('an empty page returns [] (the exhaustion signal)', async () => {
    const requested: string[] = [];
    const entries = await Effect.runPromise(
      getHistory(historyDeps(() => json([]), requested), { page: 9 }),
    );
    expect(entries).toEqual([]);
  });

  test('a malformed payload surfaces a tagged provider error, not a throw', async () => {
    const requested: string[] = [];
    const deps = historyDeps(
      () =>
        new Response('<html>nope</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      requested,
    );

    const exit = await Effect.runPromiseExit(getHistory(deps, { page: 1 }));
    expect(exit._tag).toBe('Failure');
  });
})

// ---- My calendars (plan 0030 U3) ----

/** Serves one fixed calendar body, recording the requested path+query. */
function calendarDeps(body: unknown, requested: string[]): TraktDeps {
  return {
    tokens: TOKENS,
    clientId: 'id',
    clientSecret: 'secret',
    fetch: async (input) => {
      const url = new URL(String(input));
      requested.push(url.pathname + url.search);
      return json(body);
    },
  };
}

describe('traktCalendarRange', () => {
  // Fixed local wall-clock instant: constructed from local parts so the test
  // asserts the *local* day whatever timezone CI runs in.
  const NOW = new Date(2026, 6, 27, 22, 30);

  test('defaults to the local calendar day and a 7-day window', () => {
    expect(traktCalendarRange({}, NOW)).toEqual({
      startDate: '2026-07-27',
      days: 7,
    });
  });

  test('pads single-digit months and days', () => {
    expect(traktCalendarRange({}, new Date(2026, 0, 5, 9, 0)).startDate).toBe(
      '2026-01-05',
    );
  });

  test('clamps to the 33-day range Trakt accepts', () => {
    // 34+ would 4xx and take the whole section down — better 33 days of data.
    expect(traktCalendarRange({ days: 34 }, NOW).days).toBe(33);
    expect(traktCalendarRange({ days: 365 }, NOW).days).toBe(33);
    expect(traktCalendarRange({ days: 33 }, NOW).days).toBe(33);
  });

  test('clamps a zero/negative/fractional window to at least one whole day', () => {
    expect(traktCalendarRange({ days: 0 }, NOW).days).toBe(1);
    expect(traktCalendarRange({ days: -5 }, NOW).days).toBe(1);
    expect(traktCalendarRange({ days: 7.9 }, NOW).days).toBe(7);
    expect(traktCalendarRange({ days: Number.NaN }, NOW).days).toBe(7);
  });

  test('honors an explicit bare date and falls back on anything else', () => {
    expect(traktCalendarRange({ startDate: '2026-12-01' }, NOW).startDate).toBe(
      '2026-12-01',
    );
    // An instant (or junk) would 4xx the request — degrade to today instead.
    expect(
      traktCalendarRange({ startDate: '2026-12-01T00:00:00.000Z' }, NOW).startDate,
    ).toBe('2026-07-27');
    expect(traktCalendarRange({ startDate: 'tomorrow' }, NOW).startDate).toBe(
      '2026-07-27',
    );
  });
});

describe('getMyShowsCalendar', () => {
  test('requests the range path and drops malformed rows', async () => {
    const requested: string[] = [];
    const deps = calendarDeps(
      [
        {
          first_aired: '2026-07-29T01:00:00.000Z',
          episode: { season: 2, number: 4, title: 'Aura the Guillotine' },
          show: { title: 'Frieren', ids: { trakt: 300 } },
        },
        // No air date — unbucketable, so it drops without failing the read.
        {
          episode: { season: 1, number: 1 },
          show: { title: 'Nameless', ids: { trakt: 301 } },
        },
      ],
      requested,
    );

    const entries = await Effect.runPromise(
      getMyShowsCalendar(deps, { startDate: '2026-07-27', days: 7 }),
    );

    expect(requested).toEqual([
      '/calendars/my/shows/2026-07-27/7?extended=full,images',
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.item.id).toBe('trakt-300');
    expect(entries[0]?.episode.number).toBe(4);
  });
});

describe('the movie calendars', () => {
  test('each hits its own path and tags its own release kind', async () => {
    const row = [{ released: '2026-07-31', movie: { title: 'Dune: Part Three', ids: { trakt: 400 } } }];
    const params = { startDate: '2026-07-27', days: 7 };

    for (const [read, path, kind] of [
      [getMyMoviesCalendar, '/calendars/my/movies/2026-07-27/7?extended=full,images', 'theatrical'],
      // `streaming`, not `digital` — the type name is confirmed live in
      // docs/solutions/trakt-streaming-calendar-path.md.
      [getMyStreamingCalendar, '/calendars/my/streaming/2026-07-27/7?extended=full,images', 'digital'],
      [getMyDvdCalendar, '/calendars/my/dvd/2026-07-27/7?extended=full,images', 'physical'],
    ] as const) {
      const requested: string[] = [];
      const releases = await Effect.runPromise(
        read(calendarDeps(row, requested), params),
      );
      expect(requested).toEqual([path]);
      expect(releases).toHaveLength(1);
      expect(releases[0]?.kind).toBe(kind);
      expect(releases[0]?.date).toBe('2026-07-31');
      expect(releases[0]?.item.releaseCalendar).toEqual({ [kind]: '2026-07-31' });
    }
  });

  test('a row with no release date drops rather than failing the read', async () => {
    const requested: string[] = [];
    const releases = await Effect.runPromise(
      getMyMoviesCalendar(
        calendarDeps([{ movie: { title: 'Untitled', ids: { trakt: 401 } } }], requested),
        { startDate: '2026-07-27' },
      ),
    );
    expect(releases).toEqual([]);
  });
});

/** One `/sync/watchlist` movie row, added on the given day. */
function watchlistMovie(traktId: number, listedAt: string) {
  return {
    rank: traktId,
    id: traktId * 10,
    listed_at: listedAt,
    type: 'movie',
    movie: { title: `Movie ${traktId}`, ids: { trakt: traktId } },
  };
}

describe('getWatchlist (plan 0031 U11, discussion #681)', () => {
  test('always sends page and limit, and stops on the short page', async () => {
    const requested: string[] = [];
    // A full page (the 250 max, cut from 1,000 on 2026-06-15) then a short one.
    const pages = [
      Array.from({ length: 250 }, (_, i) =>
        watchlistMovie(i + 1, '2026-07-01T00:00:00.000Z'),
      ),
      Array.from({ length: 40 }, (_, i) =>
        watchlistMovie(i + 251, '2026-07-01T00:00:00.000Z'),
      ),
    ];

    const items = await Effect.runPromise(getWatchlist(pagedDeps(pages, requested)));

    expect(requested).toEqual([
      '/sync/watchlist/all/added/desc?extended=full,images&page=1&limit=250',
      '/sync/watchlist/all/added/desc?extended=full,images&page=2&limit=250',
    ]);
    expect(items).toHaveLength(290);
  });

  test('a full page followed by an empty one terminates', async () => {
    const requested: string[] = [];
    const pages = [
      Array.from({ length: 250 }, (_, i) =>
        watchlistMovie(i + 1, '2026-07-01T00:00:00.000Z'),
      ),
      [],
    ];

    const items = await Effect.runPromise(getWatchlist(pagedDeps(pages, requested)));

    expect(requested).toHaveLength(2);
    expect(items).toHaveLength(250);
  });

  test('type/sort segments come from the caller', async () => {
    const requested: string[] = [];
    await Effect.runPromise(
      getWatchlist(pagedDeps([[]], requested), {
        type: 'shows',
        sortBy: 'rank',
        sortHow: 'asc',
      }),
    );
    expect(requested[0]).toBe(
      '/sync/watchlist/shows/rank/asc?extended=full,images&page=1&limit=250',
    );
  });

  test('season and episode rows drop instead of throwing', async () => {
    const requested: string[] = [];
    const rows = [
      watchlistMovie(1, '2026-07-01T00:00:00.000Z'),
      { type: 'season', listed_at: '2026-07-02T00:00:00.000Z', season: { number: 2 } },
      { type: 'episode', listed_at: '2026-07-03T00:00:00.000Z', episode: { number: 4 } },
      {
        type: 'show',
        listed_at: '2026-07-04T00:00:00.000Z',
        show: { title: 'Show', ids: { trakt: 900 } },
      },
    ];

    const items = await Effect.runPromise(getWatchlist(pagedDeps([rows], requested)));

    expect(items.map((item) => item.id)).toEqual(['trakt-1', 'trakt-900']);
  });

  test('lastUpdated is listed_at, so add-time ordering survives', async () => {
    const requested: string[] = [];
    const rows = [
      watchlistMovie(1, '2026-07-20T12:00:00.000Z'),
      watchlistMovie(2, '2026-06-01T09:00:00.000Z'),
    ];

    const items = await Effect.runPromise(getWatchlist(pagedDeps([rows], requested)));

    // Not the read's own clock: identical timestamps would destroy any ordering
    // by add-time (KTD-11).
    expect(items.map((item) => item.lastUpdated)).toEqual([
      '2026-07-20T12:00:00.000Z',
      '2026-06-01T09:00:00.000Z',
    ]);
    const sorted = [...items].sort((a, b) => a.lastUpdated.localeCompare(b.lastUpdated));
    expect(sorted.map((item) => item.id)).toEqual(['trakt-2', 'trakt-1']);
  });

  test('rank and the list-item id stay off the normalized item', async () => {
    const requested: string[] = [];
    const items = await Effect.runPromise(
      getWatchlist(pagedDeps([[watchlistMovie(7, '2026-07-01T00:00:00.000Z')]], requested)),
    );
    expect(items[0]?.id).toBe('trakt-7');
    expect(items[0]).not.toHaveProperty('rank');
  });
});
