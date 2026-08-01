import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { AniZipEpisodeMap } from '@/lib/providers/mapping/anizip';
import type { NormalizedMediaItem } from '@/types/media';
import type { SimklDeps } from './deps';
import {
  addToSimklWatchlist,
  logToSimkl,
  removeFromSimklWatchlist,
  type SimklLogEntry,
} from './writes';

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

function item(overrides: Partial<NormalizedMediaItem>): NormalizedMediaItem {
  return {
    id: 'test-1',
    title: 'Test Item',
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-31T00:00:00.000Z',
    externalIds: {},
    ...overrides,
  };
}

const movie = item({
  id: 'tmdb-603',
  title: 'The Matrix',
  externalIds: { tmdb: 603, imdb: 'tt0133093' },
});

const show = item({
  id: 'tmdb-1396',
  title: 'Breaking Bad',
  type: 'TV',
  externalIds: { tmdb: 1396 },
});

const anime = item({
  id: 'anilist-101922',
  title: 'Demon Slayer',
  type: 'ANIME',
  externalIds: { anilist: 101922, mal: 38000 },
});

const animeFilm = item({
  id: 'anilist-21519',
  title: 'Your Name.',
  type: 'ANIME',
  isFilm: true,
  externalIds: { anilist: 21519, mal: 32281, tmdb: 372058 },
});

function okHistoryResponse(): Response {
  return Response.json({
    added: { movies: 1, shows: 1, episodes: 2 },
    not_found: { movies: [], shows: [], episodes: [] },
  });
}

function requestBody(call: RecordedCall): Record<string, unknown> {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

function okAddToListResponse(): Response {
  return Response.json({
    added: { movies: [{ to: 'plantowatch', ids: { simkl: 1 } }], shows: [] },
    not_found: { movies: [], shows: [] },
  });
}

function okRemoveResponse(): Response {
  return Response.json({
    deleted: { movies: 1, shows: 0, episodes: 0 },
    not_found: { movies: [], shows: [] },
  });
}

describe('logToSimkl', () => {
  test('a mixed batch (movie + TV episode + anime episode) is EXACTLY ONE POST with three arrays', async () => {
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    const entries: SimklLogEntry[] = [
      { item: movie },
      { item: show, episodes: [{ season: 1, number: 2 }] },
      { item: anime, entryEpisodes: [3] },
    ];
    const result = await Effect.runPromise(logToSimkl(deps, entries));

    expect(result.status).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.pathname).toBe('/sync/history');
    expect(calls[0]!.init?.method).toBe('POST');
    const body = requestBody(calls[0]!);
    expect(body.movies).toHaveLength(1);
    expect(body.shows).toHaveLength(1);
    expect(body.anime).toHaveLength(1);
  });

  test('the history POST carries the session token', async () => {
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    await Effect.runPromise(logToSimkl(deps, [{ item: movie }]));
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-1');
  });

  test('a missing session fails as ProviderAuthError before any request', async () => {
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    deps.tokens.get = () => null;
    const error = await Effect.runPromise(Effect.flip(logToSimkl(deps, [{ item: movie }])));
    expect(error._tag).toBe('ProviderAuthError');
    expect(calls).toHaveLength(0);
  });

  test('TV episodes group by season under shows[], keyed by tmdb', async () => {
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    await Effect.runPromise(
      logToSimkl(deps, [
        {
          item: show,
          episodes: [
            { season: 1, number: 1 },
            { season: 1, number: 2 },
            { season: 2, number: 1 },
          ],
        },
      ]),
    );
    const body = requestBody(calls[0]!);
    expect(body.shows).toEqual([
      {
        ids: { tmdb: 1396 },
        seasons: [
          { number: 1, episodes: [{ number: 1 }, { number: 2 }] },
          { number: 2, episodes: [{ number: 1 }] },
        ],
      },
    ]);
    expect(body.movies).toBeUndefined();
    expect(body.anime).toBeUndefined();
  });

  test('watched_at is the ISO instant, threaded per entry', async () => {
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    await Effect.runPromise(
      logToSimkl(deps, [
        { item: movie, watchedAt: '2026-07-30T21:00:00.000Z' },
        {
          item: show,
          episodes: [{ season: 1, number: 2 }],
          watchedAt: '2026-07-29T20:00:00.000Z',
        },
      ]),
    );
    const body = requestBody(calls[0]!);
    expect((body.movies as Array<{ watched_at?: string }>)[0]!.watched_at).toBe(
      '2026-07-30T21:00:00.000Z',
    );
    expect((body.shows as Array<{ watched_at?: string }>)[0]!.watched_at).toBe(
      '2026-07-29T20:00:00.000Z',
    );
  });

  test('omitted watched_at stays omitted (Simkl records "now")', async () => {
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    await Effect.runPromise(logToSimkl(deps, [{ item: movie }]));
    const body = requestBody(calls[0]!);
    expect((body.movies as Array<Record<string, unknown>>)[0]!.watched_at).toBeUndefined();
  });

  test('ids prefer simkl over every external id', async () => {
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    const withSimklId = item({
      ...movie,
      externalIds: { simkl: 472214, tmdb: 603, imdb: 'tt0133093' },
    });
    await Effect.runPromise(logToSimkl(deps, [{ item: withSimklId }]));
    const body = requestBody(calls[0]!);
    expect((body.movies as Array<{ ids: unknown }>)[0]!.ids).toEqual({ simkl: 472214 });
  });

  test('an anime series episode passes through the AniDB-domain entry numbers verbatim', async () => {
    // entryEpisodes is the AniList-entry-relative 1..n domain — the same
    // AniDB-derived key domain ani.zip's table uses (plan 0027 KTD2), which is
    // the numbering Simkl's anime catalog speaks (plan 0034 KTD-6).
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    await Effect.runPromise(logToSimkl(deps, [{ item: anime, entryEpisodes: [3, 4] }]));
    const body = requestBody(calls[0]!);
    expect(body.anime).toEqual([
      {
        ids: { mal: 38000 },
        seasons: [{ number: 1, episodes: [{ number: 3 }, { number: 4 }] }],
      },
    ]);
    expect(body.shows).toBeUndefined();
  });

  test('a canonically-numbered anime episode remaps through the ani.zip table', async () => {
    // Canonical S2E3 corresponds to entry/AniDB number 15 in the fixture — a
    // continuous-numbered entry — so the POST must carry 15, never the naive 3.
    const episodeMap: AniZipEpisodeMap = new Map([
      [14, { season: 2, number: 2, absolute: 14 }],
      [15, { season: 2, number: 3, absolute: 15 }],
    ]);
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    await Effect.runPromise(
      logToSimkl(deps, [{ item: anime, episodes: [{ season: 2, number: 3 }], episodeMap }]),
    );
    const body = requestBody(calls[0]!);
    expect(body.anime).toEqual([
      {
        ids: { mal: 38000 },
        seasons: [{ number: 1, episodes: [{ number: 15 }] }],
      },
    ]);
  });

  test('a canonically-numbered anime episode with no mapping table is a reasoned skip, not a guess', async () => {
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    const result = await Effect.runPromise(
      logToSimkl(deps, [{ item: anime, episodes: [{ season: 2, number: 3 }] }]),
    );
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') {
      expect(result.reason).toContain('ani.zip');
    }
    expect(calls).toHaveLength(0);
  });

  test('a canonical anime episode absent from the table skips the whole entry (all-or-nothing)', async () => {
    const episodeMap: AniZipEpisodeMap = new Map([[15, { season: 2, number: 3 }]]);
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    const result = await Effect.runPromise(
      logToSimkl(deps, [
        {
          item: anime,
          episodes: [
            { season: 2, number: 3 },
            { season: 2, number: 9 },
          ],
          episodeMap,
        },
      ]),
    );
    expect(result.status).toBe('skipped');
    expect(calls).toHaveLength(0);
  });

  test('an anime film lands in anime[] with its mal id — never movies[]', async () => {
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    await Effect.runPromise(
      logToSimkl(deps, [{ item: animeFilm, watchedAt: '2026-07-30T21:00:00.000Z' }]),
    );
    const body = requestBody(calls[0]!);
    expect(body.movies).toBeUndefined();
    expect(body.anime).toEqual([
      { ids: { mal: 32281 }, watched_at: '2026-07-30T21:00:00.000Z' },
    ]);
  });

  test('an entry with no Simkl-resolvable id is a reasoned skip', async () => {
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    const bare = item({ title: 'Unidentified', externalIds: {} });
    const result = await Effect.runPromise(logToSimkl(deps, [{ item: bare }]));
    expect(result.status).toBe('skipped');
    expect(calls).toHaveLength(0);
  });

  test('an empty batch is a reasoned skip with no request', async () => {
    const { deps, calls } = makeDeps(() => okHistoryResponse());
    const result = await Effect.runPromise(logToSimkl(deps, []));
    expect(result.status).toBe('skipped');
    expect(calls).toHaveLength(0);
  });

  test('the write-lock 400 propagates ProviderRateLimitError untouched — one call, no retry', async () => {
    const { deps, calls } = makeDeps(() =>
      Response.json({ error: 'rate_limit' }, { status: 400 }),
    );
    const error = await Effect.runPromise(Effect.flip(logToSimkl(deps, [{ item: movie }])));
    expect(error._tag).toBe('ProviderRateLimitError');
    expect(calls).toHaveLength(1);
  });

  test('all submitted items in not_found is a reasoned skip', async () => {
    const { deps } = makeDeps(() =>
      Response.json({
        added: { movies: 0, shows: 0, episodes: 0 },
        not_found: { movies: [{ ids: { tmdb: 603 } }], shows: [], episodes: [] },
      }),
    );
    const result = await Effect.runPromise(logToSimkl(deps, [{ item: movie }]));
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') {
      expect(result.reason).toContain('match');
    }
  });

  test('an episode-level not_found (unmatched episodes, nothing else) is the not-found skip, not a bare ok', async () => {
    // Simkl files an episode-scoped miss under not_found.episodes, not
    // not_found.shows — it must still count as a miss, or the fan-out's
    // manual-link affordance never fires (mirrors the remove adapter's
    // episode counting).
    const { deps } = makeDeps(() =>
      Response.json({
        added: { movies: 0, shows: 0, episodes: 0 },
        not_found: {
          movies: [],
          shows: [],
          episodes: [{ ids: { tmdb: 1396 }, season: 99, number: 1 }],
        },
      }),
    );
    const result = await Effect.runPromise(
      logToSimkl(deps, [{ item: show, episodes: [{ season: 99, number: 1 }] }]),
    );
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') {
      expect(result.reason).toContain('match');
    }
  });

  test('a partial not_found reason and a dropped-entry reason BOTH survive on the ok', async () => {
    const { deps } = makeDeps(() =>
      Response.json({
        added: { movies: 1, shows: 0, episodes: 0 },
        not_found: { movies: [], shows: [{ ids: { tmdb: 1396 } }], episodes: [] },
      }),
    );
    const bare = item({ title: 'Unidentified', externalIds: {} });
    const result = await Effect.runPromise(
      logToSimkl(deps, [
        { item: movie },
        { item: show, episodes: [{ season: 1, number: 2 }] },
        { item: bare },
      ]),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      // Neither piece of news displaces the other (the pre-fix bug: dropped[0]
      // overwrote the partial-match reason).
      expect(result.reason).toContain('could not match 1 of 2');
      expect(result.reason).toContain('no Simkl-resolvable id');
    }
  });

  test('a partial not_found is still ok — carrying the reason', async () => {
    const { deps } = makeDeps(() =>
      Response.json({
        added: { movies: 1, shows: 0, episodes: 0 },
        not_found: { movies: [], shows: [{ ids: { tmdb: 1396 } }], episodes: [] },
      }),
    );
    const result = await Effect.runPromise(
      logToSimkl(deps, [{ item: movie }, { item: show, episodes: [{ season: 1, number: 2 }] }]),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.reason).toBeDefined();
    }
  });
});

describe('addToSimklWatchlist', () => {
  test('POSTs /sync/add-to-list with a per-item to: plantowatch', async () => {
    const { deps, calls } = makeDeps(() => okAddToListResponse());
    const result = await Effect.runPromise(addToSimklWatchlist(deps, movie));
    expect(result.status).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.pathname).toBe('/sync/add-to-list');
    const body = requestBody(calls[0]!);
    expect(body.movies).toEqual([
      { to: 'plantowatch', ids: { tmdb: 603, imdb: 'tt0133093' } },
    ]);
  });

  test('a TV show watchlists under shows[] with its tmdb id', async () => {
    const { deps, calls } = makeDeps(() => okAddToListResponse());
    await Effect.runPromise(addToSimklWatchlist(deps, show));
    const body = requestBody(calls[0]!);
    expect(body.shows).toEqual([{ to: 'plantowatch', ids: { tmdb: 1396 } }]);
  });

  test('an anime film watchlists under anime[] with its mal id', async () => {
    const { deps, calls } = makeDeps(() => okAddToListResponse());
    await Effect.runPromise(addToSimklWatchlist(deps, animeFilm));
    const body = requestBody(calls[0]!);
    expect(body.movies).toBeUndefined();
    expect(body.anime).toEqual([{ to: 'plantowatch', ids: { mal: 32281 } }]);
  });

  test('an all-not_found add is a reasoned skip', async () => {
    const { deps } = makeDeps(() =>
      Response.json({
        added: { movies: [], shows: [] },
        not_found: { movies: [{ ids: { tmdb: 603 } }], shows: [] },
      }),
    );
    const result = await Effect.runPromise(addToSimklWatchlist(deps, movie));
    expect(result.status).toBe('skipped');
  });

  test('MANGA fails loudly — routing should never have sent it here', async () => {
    const { deps, calls } = makeDeps(() => okAddToListResponse());
    const manga = item({ title: 'Berserk', type: 'MANGA', externalIds: { anilist: 30002 } });
    const error = await Effect.runPromise(Effect.flip(addToSimklWatchlist(deps, manga)));
    expect(error._tag).toBe('ProviderDecodeError');
    expect(calls).toHaveLength(0);
  });
});

/**
 * One `/sync/all-items` bucket row, as the plan-0036 fresh-read guard sees it.
 * `watched` is what makes a removal destructive.
 */
function planToWatchRow(
  media: { ids: Record<string, number | string>; title: string },
  watched = 0,
) {
  return {
    status: 'plantowatch',
    watched_episodes_count: watched,
    // A `simkl` id is what makes the row normalizable at all — without one
    // `normalizeLibraryEntry` drops it, so every fixture row carries one.
    show: { ids: { simkl: 900_000, ...media.ids }, title: media.title },
  };
}

/**
 * The two-request shape every removal now has: a `GET /sync/all-items/all/
 * plantowatch` guard read, then (only if it clears) the `POST
 * /sync/history/remove`.
 */
function makeRemoveDeps(
  library: Record<string, unknown>,
  removeResponse: () => Response = okRemoveResponse,
) {
  return makeDeps((url) =>
    new URL(url).pathname.startsWith('/sync/all-items')
      ? Response.json(library)
      : removeResponse(),
  );
}

describe('removeFromSimklWatchlist', () => {
  test('reads the live plantowatch list first, then hits POST /sync/history/remove', async () => {
    const { deps, calls } = makeRemoveDeps({
      movies: [planToWatchRow({ ids: { tmdb: 603 }, title: 'The Matrix' })],
    });
    const result = await Effect.runPromise(removeFromSimklWatchlist(deps, movie));
    expect(result.status).toBe('ok');
    expect(calls).toHaveLength(2);
    // The fresh in-effect read (plan 0031 R36) — never a cached watchlist row.
    expect(calls[0]!.url.pathname).toBe('/sync/all-items/all/plantowatch');
    expect(calls[1]!.url.pathname).toBe('/sync/history/remove');
    expect(calls[1]!.init?.method).toBe('POST');
    const body = requestBody(calls[1]!);
    // Whole-item (no seasons/episodes): the documented un-track form that
    // clears the list entry — a seasons-scoped body would only unmark watched.
    expect(body.movies).toEqual([{ ids: { tmdb: 603, imdb: 'tt0133093' } }]);
  });

  test('an anime removes under anime[] with its mal id', async () => {
    const { deps, calls } = makeRemoveDeps({
      anime: [planToWatchRow({ ids: { mal: 38000 }, title: 'Demon Slayer' })],
    });
    await Effect.runPromise(removeFromSimklWatchlist(deps, anime));
    expect(requestBody(calls[1]!).anime).toEqual([{ ids: { mal: 38000 } }]);
  });

  test('absent from the fresh plantowatch list is a reasoned skip with no POST', async () => {
    // The post-log case: the item moved to `watching`/`completed` server-side,
    // so there is nothing to remove — and nothing hits Simkl's write lock.
    const { deps, calls } = makeRemoveDeps({ movies: [] });
    const result = await Effect.runPromise(removeFromSimklWatchlist(deps, movie));
    expect(result.status).toBe('skipped');
    expect(calls).toHaveLength(1);
  });

  test('a plan-to-watch row that still holds watch history refuses without an explicit confirm', async () => {
    const { deps, calls } = makeRemoveDeps({
      shows: [planToWatchRow({ ids: { tmdb: 1396 }, title: 'Breaking Bad' }, 12)],
    });
    const result = await Effect.runPromise(removeFromSimklWatchlist(deps, show));
    expect(result.status).toBe('skipped');
    // The whole point: no POST fired, so the 12 watched episodes still exist.
    expect(calls).toHaveLength(1);
  });

  test('…and removes it once allowDestructive is passed', async () => {
    const { deps, calls } = makeRemoveDeps({
      shows: [planToWatchRow({ ids: { tmdb: 1396 }, title: 'Breaking Bad' }, 12)],
    });
    const result = await Effect.runPromise(
      removeFromSimklWatchlist(deps, show, { allowDestructive: true }),
    );
    expect(result.status).toBe('ok');
    expect(calls).toHaveLength(2);
  });

  test('a clean removal reporting deleted: 0 is still ok, not a skip', async () => {
    // A plan-to-watch row has no history rows to delete, so `deleted: 0` is the
    // normal answer — membership was already proven by the guard read.
    const { deps } = makeRemoveDeps(
      { movies: [planToWatchRow({ ids: { tmdb: 603 }, title: 'The Matrix' })] },
      () =>
        Response.json({
          deleted: { movies: 0, shows: 0, episodes: 0 },
          not_found: { movies: [], shows: [] },
        }),
    );
    const result = await Effect.runPromise(removeFromSimklWatchlist(deps, movie));
    expect(result.status).toBe('ok');
  });

  test('an all-not_found remove is a reasoned skip', async () => {
    const { deps } = makeRemoveDeps(
      { movies: [planToWatchRow({ ids: { tmdb: 603 }, title: 'The Matrix' })] },
      () =>
        Response.json({
          deleted: { movies: 0, shows: 0, episodes: 0 },
          not_found: { movies: [{ ids: { tmdb: 603 } }], shows: [] },
        }),
    );
    const result = await Effect.runPromise(removeFromSimklWatchlist(deps, movie));
    expect(result.status).toBe('skipped');
  });

  test('an episode-level not_found on remove is a reasoned skip too', async () => {
    const { deps } = makeRemoveDeps(
      { shows: [planToWatchRow({ ids: { tmdb: 1396 }, title: 'Breaking Bad' })] },
      () =>
        Response.json({
          deleted: { movies: 0, shows: 0, episodes: 0 },
          not_found: { movies: [], shows: [], episodes: [{ ids: { tmdb: 1396 } }] },
        }),
    );
    const result = await Effect.runPromise(removeFromSimklWatchlist(deps, show));
    expect(result.status).toBe('skipped');
  });

  test('a film-shaped row never matches a series-shaped one on a shared TMDB number', async () => {
    // TMDB numbers movies and series independently; the guard searches all
    // three buckets at once, so shape has to gate the bridge-id match.
    const { deps, calls } = makeRemoveDeps({
      shows: [planToWatchRow({ ids: { tmdb: 603 }, title: 'Some Series' })],
    });
    const result = await Effect.runPromise(removeFromSimklWatchlist(deps, movie));
    expect(result.status).toBe('skipped');
    expect(calls).toHaveLength(1);
  });
});
