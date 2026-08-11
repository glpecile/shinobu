import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { ProviderSession } from '@/types/session';
import {
  addToTraktWatchlist,
  logToTrakt,
  removeFromTraktWatchlist,
  type TraktLogOptions,
} from './writes';
import type { TokenStore } from '@/lib/providers/token-store';
import type { TraktDeps } from './deps';

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

interface TraktEpisodeBody {
  number: number;
  watched_at?: string;
}
interface TraktSeasonBody {
  number: number;
  episodes: TraktEpisodeBody[];
}
interface TraktHistoryBody {
  shows: [{ seasons: TraktSeasonBody[] }];
}

/** Records the POST body sent to /sync/history and replies with added.episodes. */
function capturingDeps(captured: { body: unknown }) {
  const deps: TraktDeps = {
    tokens: TOKENS,
    clientId: 'id',
    clientSecret: 'secret',
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/sync/history' && init?.method === 'POST') {
        captured.body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            added: { movies: 0, episodes: 1 },
            not_found: { movies: [], shows: [], episodes: [] },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`unexpected ${path}`);
    },
  };
  return deps;
}

const TV_ITEM = {
  id: 'trakt-7',
  title: 'Snowpiercer',
  coverImage: '',
  type: 'TV' as const,
  currentProgress: 0,
  progressUnit: 'episode' as const,
  lastUpdated: '2026-07-10T00:00:00Z',
  externalIds: { trakt: 7, tmdb: 8 },
};

describe('logToTrakt TV batch', () => {
  test('a single `episode` posts the episode inside one season', async () => {
    const captured = { body: null as unknown };
    const options: TraktLogOptions = { episode: { season: 1, number: 3 } };
    await Effect.runPromise(logToTrakt(capturingDeps(captured), TV_ITEM, options));

    const body = captured.body as TraktHistoryBody;
    expect(body.shows[0].seasons).toEqual([
      { number: 1, episodes: [{ number: 3 }] },
    ]);
  });

  test('a whole-season `episodes` batch groups by season in one request', async () => {
    const captured = { body: null as unknown };
    const options: TraktLogOptions = {
      episodes: [
        { season: 2, number: 1 },
        { season: 2, number: 2 },
        { season: 1, number: 5 },
      ],
      watchedAt: '2026-07-13T00:00:00Z',
    };
    await Effect.runPromise(logToTrakt(capturingDeps(captured), TV_ITEM, options));

    const body = captured.body as TraktHistoryBody;
    // Map-insertion order is the batch's first-seen order: season 2, then 1.
    const byNumber = new Map(
      body.shows[0].seasons.map((s) => [
        s.number,
        s.episodes.map((e) => e.number),
      ]),
    );
    expect(byNumber.get(1)).toEqual([5]);
    expect(byNumber.get(2)).toEqual([1, 2]);
    // watchedAt threads through to every episode.
    for (const season of body.shows[0].seasons) {
      for (const episode of season.episodes) {
        expect(episode.watched_at).toBe('2026-07-13T00:00:00Z');
      }
    }
  });

  test('a TV log with neither episode nor episodes fails loudly', async () => {
    const captured = { body: null as unknown };
    const result = await Effect.runPromise(
      Effect.either(logToTrakt(capturingDeps(captured), TV_ITEM, {})),
    );
    expect(result._tag).toBe('Left');
  });
});

/** A /sync/history stub replying with one fixed response. */
function historyDeps(response: unknown): TraktDeps {
  return {
    tokens: TOKENS,
    clientId: 'id',
    clientSecret: 'secret',
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path !== '/sync/history' || init?.method !== 'POST') {
        throw new Error(`unexpected ${init?.method} ${path}`);
      }
      return new Response(JSON.stringify(response), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
}

describe('logToTrakt outcome read (the watchlist add\'s three-way, on history)', () => {
  const movie = {
    id: 'trakt-42',
    title: 'Sinners',
    coverImage: '',
    type: 'MOVIE' as const,
    currentProgress: 0,
    progressUnit: 'episode' as const,
    lastUpdated: '2026-07-10T00:00:00Z',
    externalIds: { trakt: 42, tmdb: 43 },
  };

  test('an added play is ok', async () => {
    const result = await Effect.runPromise(
      logToTrakt(
        historyDeps({
          added: { movies: 1, episodes: 0 },
          not_found: { movies: [], shows: [], episodes: [] },
        }),
        movie,
      ),
    );
    expect(result).toEqual({ status: 'ok' });
  });

  test('a rewatch play Trakt declines (Disable Multiple Plays) is a reasoned skip, not not_found', async () => {
    const result = await Effect.runPromise(
      logToTrakt(
        historyDeps({
          added: { movies: 0, episodes: 0 },
          not_found: { movies: [], shows: [], episodes: [] },
        }),
        movie,
      ),
    );
    expect(result).toMatchObject({ status: 'skipped' });
  });

  test('a non-empty not_found still fails naming the item', async () => {
    const result = await Effect.runPromise(
      Effect.flip(
        logToTrakt(
          historyDeps({
            added: { movies: 0, episodes: 0 },
            not_found: { movies: [{ ids: { tmdb: 43 } }], shows: [], episodes: [] },
          }),
          movie,
        ),
      ),
    );
    expect(result._tag).toBe('ProviderDecodeError');
    expect((result as { detail: string }).detail).toContain('not_found');
  });
});

const MOVIE_ITEM = {
  id: 'trakt-42',
  title: 'Sinners',
  coverImage: '',
  type: 'MOVIE' as const,
  currentProgress: 0,
  progressUnit: 'episode' as const,
  lastUpdated: '2026-07-10T00:00:00Z',
  externalIds: { trakt: 42, tmdb: 43 },
};

const EMPTY_NOT_FOUND = { movies: [], shows: [], seasons: [], episodes: [] };
const ZERO = { movies: 0, shows: 0, seasons: 0, episodes: 0 };

/**
 * A /sync/watchlist stub that replies with a caller-supplied queue of
 * responses, one per call, and records every request — so a test can assert
 * *how many times* the adapter hit the endpoint, not just what came back.
 */
function watchlistDeps(
  responses: Array<() => Response>,
  calls: { bodies: unknown[] },
) {
  const deps: TraktDeps = {
    tokens: TOKENS,
    clientId: 'id',
    clientSecret: 'secret',
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path !== '/sync/watchlist' || init?.method !== 'POST') {
        throw new Error(`unexpected ${init?.method} ${path}`);
      }
      calls.bodies.push(JSON.parse(String(init.body)));
      const next = responses[calls.bodies.length - 1];
      if (next == null) throw new Error('more calls than queued responses');
      return next();
    },
  };
  return deps;
}

/**
 * Sub-second Retry-After purely so the bounded sleep doesn't slow the suite;
 * the assertions below are about the retry *count*, not the delay.
 */
const rateLimited = () =>
  new Response('', { status: 429, headers: { 'Retry-After': '0.01' } });

function json(body: unknown, status = 201, headers: Record<string, string> = {}) {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
}

describe('addToTraktWatchlist', () => {
  test('a movie posts ids only under `movies` and reports ok when added', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = watchlistDeps(
      [
        json({
          added: { ...ZERO, movies: 1 },
          existing: ZERO,
          not_found: EMPTY_NOT_FOUND,
        }),
      ],
      calls,
    );

    const result = await Effect.runPromise(addToTraktWatchlist(deps, MOVIE_ITEM));

    expect(result).toEqual({ status: 'ok' });
    // Ids and nothing else — no watched_at, no seasons/episodes (R3).
    expect(calls.bodies[0]).toEqual({ movies: [{ ids: { trakt: 42, tmdb: 43 } }] });
  });

  test('a TV show posts under `shows`', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = watchlistDeps(
      [
        json({
          added: { ...ZERO, shows: 1 },
          existing: ZERO,
          not_found: EMPTY_NOT_FOUND,
        }),
      ],
      calls,
    );

    const result = await Effect.runPromise(addToTraktWatchlist(deps, TV_ITEM));

    expect(result).toEqual({ status: 'ok' });
    expect(calls.bodies[0]).toEqual({ shows: [{ ids: { trakt: 7, tmdb: 8 } }] });
  });

  test('an anime film posts as a movie, mirroring the log routing', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = watchlistDeps(
      [
        json({
          added: { ...ZERO, movies: 1 },
          existing: ZERO,
          not_found: EMPTY_NOT_FOUND,
        }),
      ],
      calls,
    );

    await Effect.runPromise(
      addToTraktWatchlist(deps, {
        ...MOVIE_ITEM,
        type: 'ANIME' as const,
        isFilm: true,
      }),
    );

    expect(calls.bodies[0]).toHaveProperty('movies');
  });

  test('a re-add is a reasoned skip, read off `existing` and not a membership query', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = watchlistDeps(
      [
        json({
          added: ZERO,
          existing: { ...ZERO, movies: 1 },
          not_found: EMPTY_NOT_FOUND,
        }),
      ],
      calls,
    );

    const result = await Effect.runPromise(addToTraktWatchlist(deps, MOVIE_ITEM));

    expect(result).toEqual({ status: 'skipped', reason: 'already on your watchlist' });
    // Exactly one request: the idempotency signal is the write's own response
    // (R16), never a read issued before it.
    expect(calls.bodies).toHaveLength(1);
  });

  test('a non-empty not_found fails naming the item', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = watchlistDeps(
      [
        json({
          added: ZERO,
          existing: ZERO,
          not_found: { ...EMPTY_NOT_FOUND, movies: [{ ids: { tmdb: 43 } }] },
        }),
      ],
      calls,
    );

    const result = await Effect.runPromise(
      Effect.either(addToTraktWatchlist(deps, MOVIE_ITEM)),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left.message).toContain('Sinners');
    }
  });

  test('an all-zero response is a failure, not a silent ok', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = watchlistDeps(
      [json({ added: ZERO, existing: ZERO, not_found: EMPTY_NOT_FOUND })],
      calls,
    );

    const result = await Effect.runPromise(
      Effect.either(addToTraktWatchlist(deps, MOVIE_ITEM)),
    );

    expect(result._tag).toBe('Left');
  });

  test('an item with no usable id fails before any request', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = watchlistDeps([], calls);

    const result = await Effect.runPromise(
      Effect.either(
        addToTraktWatchlist(deps, { ...MOVIE_ITEM, externalIds: { anilist: 1 } }),
      ),
    );

    expect(result._tag).toBe('Left');
    expect(calls.bodies).toHaveLength(0);
  });

  test('a MANGA item never reaches the network', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = watchlistDeps([], calls);

    const result = await Effect.runPromise(
      Effect.either(addToTraktWatchlist(deps, { ...MOVIE_ITEM, type: 'MANGA' as const })),
    );

    expect(result._tag).toBe('Left');
    expect(calls.bodies).toHaveLength(0);
  });

  test('a 420 is a permanent account-limit failure and is never retried', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = watchlistDeps(
      [
        () =>
          new Response('', {
            status: 420,
            headers: { 'X-Account-Limit': '100', 'X-Upgrade-URL': 'https://trakt.tv/vip' },
          }),
      ],
      calls,
    );

    const result = await Effect.runPromise(
      Effect.either(addToTraktWatchlist(deps, MOVIE_ITEM)),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      // Not the meaningless "Trakt responded 420" the generic non-2xx path gives.
      expect(result.left.message).toContain('account limit');
      expect(result.left.message).toContain('100');
      expect(result.left.message).toContain('https://trakt.tv/vip');
    }
    // The account limit is permanent for this request — a retry could only fail
    // again (and would double the write attempt).
    expect(calls.bodies).toHaveLength(1);
  });

  test('a 429 retries exactly once through withRateLimitRetry', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = watchlistDeps(
      [
        rateLimited,
        json({
          added: { ...ZERO, movies: 1 },
          existing: ZERO,
          not_found: EMPTY_NOT_FOUND,
        }),
      ],
      calls,
    );

    const result = await Effect.runPromise(addToTraktWatchlist(deps, MOVIE_ITEM));

    expect(result).toEqual({ status: 'ok' });
    expect(calls.bodies).toHaveLength(2);
  });

  test('a second 429 propagates instead of retrying forever', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = watchlistDeps([rateLimited, rateLimited], calls);

    const result = await Effect.runPromise(
      Effect.either(addToTraktWatchlist(deps, MOVIE_ITEM)),
    );

    expect(result._tag).toBe('Left');
    expect(calls.bodies).toHaveLength(2);
  });
});

/**
 * The same queue-and-record stub as `watchlistDeps`, pointed at the remove
 * endpoint — a wrong path must fail the test loudly, not quietly pass.
 */
function removeDeps(responses: Array<() => Response>, calls: { bodies: unknown[] }) {
  const deps: TraktDeps = {
    tokens: TOKENS,
    clientId: 'id',
    clientSecret: 'secret',
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path !== '/sync/watchlist/remove' || init?.method !== 'POST') {
        throw new Error(`unexpected ${init?.method} ${path}`);
      }
      calls.bodies.push(JSON.parse(String(init.body)));
      const next = responses[calls.bodies.length - 1];
      if (next == null) throw new Error('more calls than queued responses');
      return next();
    },
  };
  return deps;
}

describe('removeFromTraktWatchlist (plan 0031 R34)', () => {
  test('a deleted movie reports ok, posting ids only', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = removeDeps(
      [json({ deleted: { ...ZERO, movies: 1 }, not_found: EMPTY_NOT_FOUND })],
      calls,
    );

    const result = await Effect.runPromise(removeFromTraktWatchlist(deps, MOVIE_ITEM));

    expect(result).toEqual({ status: 'ok' });
    expect(calls.bodies[0]).toEqual({ movies: [{ ids: { trakt: 42, tmdb: 43 } }] });
  });

  test('a TV show posts under `shows`', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = removeDeps(
      [json({ deleted: { ...ZERO, shows: 1 }, not_found: EMPTY_NOT_FOUND })],
      calls,
    );

    const result = await Effect.runPromise(removeFromTraktWatchlist(deps, TV_ITEM));

    expect(result).toEqual({ status: 'ok' });
    expect(calls.bodies[0]).toEqual({ shows: [{ ids: { trakt: 7, tmdb: 8 } }] });
  });

  test('nothing deleted and nothing unmatched is a reasoned skip, not a failure', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = removeDeps([json({ deleted: ZERO, not_found: EMPTY_NOT_FOUND })], calls);

    const result = await Effect.runPromise(removeFromTraktWatchlist(deps, MOVIE_ITEM));

    // Trakt matched the item and had nothing to remove — the user's intent
    // already holds, so this is `skipped`, never an error.
    expect(result).toEqual({ status: 'skipped', reason: 'was not on your watchlist' });
    expect(calls.bodies).toHaveLength(1);
  });

  test('a non-empty not_found fails naming the item', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = removeDeps(
      [
        json({
          deleted: ZERO,
          not_found: { ...EMPTY_NOT_FOUND, movies: [{ ids: { tmdb: 43 } }] },
        }),
      ],
      calls,
    );

    const result = await Effect.runPromise(
      Effect.either(removeFromTraktWatchlist(deps, MOVIE_ITEM)),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left.message).toContain('Sinners');
    }
  });

  test('an item with no usable id fails before any request', async () => {
    const calls = { bodies: [] as unknown[] };
    const deps = removeDeps([], calls);

    const result = await Effect.runPromise(
      Effect.either(
        removeFromTraktWatchlist(deps, { ...MOVIE_ITEM, externalIds: {} }),
      ),
    );

    expect(result._tag).toBe('Left');
    expect(calls.bodies).toHaveLength(0);
  });
});
