import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { SimklDeps } from './deps';
import {
  getAllItems,
  getCalendar,
  getLastActivities,
  getMonthlyCalendar,
  getTrending,
  getUserSettings,
  lookupByExternalId,
} from './reads';

interface RecordedCall {
  url: URL;
  init?: RequestInit;
}

function makeDeps(handler: (url: string, init?: RequestInit) => Response): {
  deps: SimklDeps;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const deps: SimklDeps = {
    clientId: 'cid-1',
    fetch: async (input, init) => {
      calls.push({ url: new URL(String(input)), init });
      return handler(String(input), init);
    },
    tokens: {
      get: () => ({ accessToken: 'tok-1' }),
      set: () => {},
      clear: () => {},
    },
  };
  return { deps, calls };
}

function headersOf(call: RecordedCall): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

describe('getAllItems', () => {
  test('requests the full un-typed snapshot with the episode/next-watch params', async () => {
    const { deps, calls } = makeDeps(() => Response.json({}));
    await Effect.runPromise(getAllItems(deps));
    const url = calls[0]!.url;
    expect(url.origin).toBe('https://api.simkl.com');
    expect(url.pathname).toBe('/sync/all-items');
    expect(url.searchParams.get('extended')).toBe('full');
    expect(url.searchParams.get('episode_watched_at')).toBe('yes');
    // `next_to_watch_info` (the air instant U8 falls back on) only exists
    // under this param — api.simkl.org get-all-items, verified 2026-07-31.
    expect(url.searchParams.get('next_watch_info')).toBe('yes');
    expect(headersOf(calls[0]!).Authorization).toBe('Bearer tok-1');
  });

  test('type and status become path segments', async () => {
    const { deps, calls } = makeDeps(() => Response.json({}));
    await Effect.runPromise(getAllItems(deps, { type: 'anime', status: 'watching' }));
    expect(calls[0]!.url.pathname).toBe('/sync/all-items/anime/watching');
  });

  test("a status without a type rides Simkl's `all` type segment", async () => {
    const { deps, calls } = makeDeps(() => Response.json({}));
    await Effect.runPromise(getAllItems(deps, { status: 'plantowatch' }));
    expect(calls[0]!.url.pathname).toBe('/sync/all-items/all/plantowatch');
  });

  test('normalizes the buckets into library entries', async () => {
    const { deps } = makeDeps(() =>
      Response.json({
        shows: [
          {
            status: 'watching',
            watched_episodes_count: 2,
            show: { title: 'A', ids: { simkl: 7, tmdb: '99' } },
          },
        ],
      }),
    );
    const library = await Effect.runPromise(getAllItems(deps));
    expect(library.shows).toHaveLength(1);
    expect(library.shows[0]!.item.externalIds).toMatchObject({ simkl: 7, tmdb: 99 });
    expect(library.movies).toEqual([]);
    expect(library.anime).toEqual([]);
  });

  test('an X-Pagination header fails loudly — the snapshot assumption is named', async () => {
    // Docs (2026-07-31) state /sync/all-items is never paginated; if Simkl
    // ever changes that, silently reading page 1 as "the whole library" would
    // corrupt every downstream merge. Assert-and-degrade instead.
    const { deps } = makeDeps(
      () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Pagination-Page-Count': '4',
          },
        }),
    );
    const error = await Effect.runPromise(Effect.flip(getAllItems(deps)));
    expect(error._tag).toBe('ProviderDecodeError');
    expect(error.message).toContain('full-snapshot');
  });
});

describe('getLastActivities', () => {
  test('reads /sync/activities authed and parses the delta shape', async () => {
    const { deps, calls } = makeDeps(() =>
      Response.json({
        all: '2026-07-30T06:50:38Z',
        tv_shows: { all: '2026-07-29T10:00:00Z' },
        movies: { all: null },
      }),
    );
    const activities = await Effect.runPromise(getLastActivities(deps));
    expect(calls[0]!.url.pathname).toBe('/sync/activities');
    expect(headersOf(calls[0]!).Authorization).toBe('Bearer tok-1');
    expect(activities.all).toBe('2026-07-30T06:50:38Z');
    expect(activities.tvShows.all).toBe('2026-07-29T10:00:00Z');
    expect(activities.anime.all).toBeNull();
  });
});

describe('getCalendar', () => {
  const file = {
    calendar: [
      {
        simkl_id: 1,
        date: '2026-08-02T16:00:00Z',
        finale_type: null,
        episode: { season: 1, episode: 2 },
      },
    ],
    metadata: { '1': { title: 'A', poster: 'aa/bb', ids: { simkl_id: 1 } } },
  };

  test('hits the CDN with standard params, no Authorization, no cache-buster', async () => {
    const { deps, calls } = makeDeps(() => Response.json(file));
    const entries = await Effect.runPromise(getCalendar(deps, 'tv'));
    const url = calls[0]!.url;
    expect(url.origin).toBe('https://data.simkl.in');
    expect(url.pathname).toBe('/calendar/v2/tv.json');
    // Exactly the three standard params — never a cache-busting extra (KTD-4
    // — the CDN caches per-URL; a varying param would defeat its 5h cache).
    expect([...url.searchParams.keys()].sort()).toEqual([
      'app-name',
      'app-version',
      'client_id',
    ]);
    expect(headersOf(calls[0]!).Authorization).toBeUndefined();
    expect(entries[0]!.date).toBe('2026-08-02T16:00:00Z');
  });

  test('the anime and movie_release kinds map to their files', async () => {
    const { deps, calls } = makeDeps(() => Response.json({ calendar: [], metadata: {} }));
    await Effect.runPromise(getCalendar(deps, 'anime'));
    await Effect.runPromise(getCalendar(deps, 'movie_release'));
    expect(calls[0]!.url.pathname).toBe('/calendar/v2/anime.json');
    expect(calls[1]!.url.pathname).toBe('/calendar/v2/movie_release.json');
  });
});

describe('getMonthlyCalendar', () => {
  test('zero-pads the month in the archive path', async () => {
    const { deps, calls } = makeDeps(() => Response.json({ calendar: [], metadata: {} }));
    await Effect.runPromise(getMonthlyCalendar(deps, 'tv', 2026, 3));
    expect(calls[0]!.url.origin).toBe('https://data.simkl.in');
    expect(calls[0]!.url.pathname).toBe('/calendar/v2/2026/03/tv.json');
    expect(headersOf(calls[0]!).Authorization).toBeUndefined();
  });

  test('a two-digit month stays two digits', async () => {
    const { deps, calls } = makeDeps(() => Response.json({ calendar: [], metadata: {} }));
    await Effect.runPromise(getMonthlyCalendar(deps, 'movie_release', 2025, 11));
    expect(calls[0]!.url.pathname).toBe('/calendar/v2/2025/11/movie_release.json');
  });
});

describe('getTrending', () => {
  test('reads the public CDN trending file for the kind, unauthenticated', async () => {
    const { deps, calls } = makeDeps(() =>
      Response.json([
        {
          title: 'The Odyssey',
          poster: '20/20233461737b3bf5ec',
          ids: { simkl_id: 2604475, tmdb: '1368337' },
        },
        { title: 'No id — drops' },
      ]),
    );
    const items = await Effect.runPromise(getTrending(deps, 'movies'));
    const url = calls[0]!.url;
    expect(url.origin).toBe('https://data.simkl.in');
    expect(url.pathname).toBe('/discover/trending/movies/week_100.json');
    expect(headersOf(calls[0]!).Authorization).toBeUndefined();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'simkl-2604475',
      title: 'The Odyssey',
      coverImage: 'https://simkl.in/posters/20/20233461737b3bf5ec_m.webp',
      type: 'MOVIE',
      externalIds: { simkl: 2604475, tmdb: 1368337 },
    });
  });

  test('interval is selectable; tv and anime map to their paths', async () => {
    const { deps, calls } = makeDeps(() => Response.json([]));
    await Effect.runPromise(getTrending(deps, 'tv', { interval: 'today' }));
    await Effect.runPromise(getTrending(deps, 'anime', { interval: 'month' }));
    expect(calls[0]!.url.pathname).toBe('/discover/trending/tv/today_100.json');
    expect(calls[1]!.url.pathname).toBe('/discover/trending/anime/month_100.json');
  });
});

describe('getUserSettings', () => {
  test('POSTs /users/settings (a read, POST-shaped per the docs) with the token', async () => {
    const { deps, calls } = makeDeps(() =>
      Response.json({
        user: { name: 'gian' },
        account: { id: 9, timezone: 'UTC', type: 'free' },
      }),
    );
    const settings = await Effect.runPromise(getUserSettings(deps));
    expect(calls[0]!.url.pathname).toBe('/users/settings');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(headersOf(calls[0]!).Authorization).toBe('Bearer tok-1');
    expect(settings.username).toBe('gian');
    expect(settings.accountId).toBe(9);
  });
});

describe('lookupByExternalId', () => {
  test('builds the /search/id query from the provided ids', async () => {
    const { deps, calls } = makeDeps(() =>
      Response.json([
        {
          type: 'tv',
          title: 'House of the Dragon',
          ids: { simkl: 1197910, slug: 'house-of-the-dragon' },
        },
      ]),
    );
    const matches = await Effect.runPromise(
      lookupByExternalId(deps, { tmdb: 94997, type: 'show' }),
    );
    const url = calls[0]!.url;
    expect(url.pathname).toBe('/search/id');
    expect(url.searchParams.get('tmdb')).toBe('94997');
    expect(url.searchParams.get('type')).toBe('show');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.externalIds.simkl).toBe(1197910);
  });

  test('mal/anilist/imdb lookups pass their params through', async () => {
    const { deps, calls } = makeDeps(() => Response.json([]));
    await Effect.runPromise(lookupByExternalId(deps, { mal: 437 }));
    await Effect.runPromise(lookupByExternalId(deps, { anilist: 21, imdb: 'tt1' }));
    expect(calls[0]!.url.searchParams.get('mal')).toBe('437');
    expect(calls[1]!.url.searchParams.get('anilist')).toBe('21');
    expect(calls[1]!.url.searchParams.get('imdb')).toBe('tt1');
  });

  test('an unknown id resolves to an empty array (Simkl 200s with [])', async () => {
    const { deps } = makeDeps(() => Response.json([]));
    const matches = await Effect.runPromise(lookupByExternalId(deps, { tvdb: 1 }));
    expect(matches).toEqual([]);
  });
});
