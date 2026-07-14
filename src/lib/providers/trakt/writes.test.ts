import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { ProviderSession } from '@/types/session';
import { logToTrakt, type TraktLogOptions } from './writes';
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