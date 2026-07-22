import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { NormalizedMediaItem } from '@/types/media';
import type { SerializdDeps, SerializdSession } from './deps';
import { logToSerializd } from './writes';

interface Recorded {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

const SESSION: SerializdSession = { accessToken: 'tok', username: 'gian' };

function fakeDeps(opts: {
  seasonId?: number | null;
  episodeLogStatus?: number;
  reviewStatus?: number;
  session?: SerializdSession | null;
  onRequest?: (r: Recorded) => void;
}): SerializdDeps {
  const seasonId = opts.seasonId === undefined ? 555 : opts.seasonId;
  return {
    baseUrl: 'https://api.test',
    session: opts.session === undefined ? SESSION : opts.session,
    fetch: async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body =
        init?.body != null
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : undefined;
      opts.onRequest?.({ url, method, body });
      if (url.includes('/season/')) return Response.json({ seasonId });
      if (url.endsWith('/episode_log/add')) {
        return new Response('{}', { status: opts.episodeLogStatus ?? 200 });
      }
      if (url.endsWith('/show/reviews/add')) {
        return new Response('{}', { status: opts.reviewStatus ?? 200 });
      }
      return new Response('{}', { status: 200 });
    },
  };
}

function tvShow(externalIds: NormalizedMediaItem['externalIds']): NormalizedMediaItem {
  return {
    id: 'trakt-1396',
    title: 'Breaking Bad',
    coverImage: '',
    type: 'TV',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-16T00:00:00.000Z',
    externalIds,
  };
}

describe('logToSerializd', () => {
  test('marks the episode watched, then adds the dated diary entry (order + payloads)', async () => {
    const requests: Recorded[] = [];
    const deps = fakeDeps({ onRequest: (r) => requests.push(r) });

    const result = await Effect.runPromise(
      logToSerializd(deps, tvShow({ tmdb: 1396 }), {
        episode: { season: 1, number: 5 },
        watchedAt: '2026-07-15T20:00:00.000Z',
        tags: ['binge', ' late-night '],
        rewatch: true,
      }),
    );
    expect(result).toEqual({ status: 'ok' });

    // GET season, then POST episode_log/add, then POST reviews/add — order matters (R8).
    expect(requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'GET /show/1396/season/1',
      'POST /episode_log/add',
      'POST /show/reviews/add',
    ]);

    const episodeLog = requests[1].body!;
    expect(episodeLog).toMatchObject({
      episode_numbers: [5],
      season_id: 555,
      show_id: 1396,
      should_get_next_episode: false,
    });

    const diary = requests[2].body!;
    expect(diary).toMatchObject({
      show_id: 1396,
      season_id: 555,
      episode_number: 5,
      backdate: '2026-07-15T20:00:00.000Z',
      is_log: true,
      is_rewatch: true,
      // Tags are trimmed of surrounding whitespace (R10).
      tags: ['binge', 'late-night'],
    });
  });

  test('does not mark a rewatch by default', async () => {
    const requests: Recorded[] = [];
    const deps = fakeDeps({ onRequest: (r) => requests.push(r) });
    await Effect.runPromise(
      logToSerializd(deps, tvShow({ tmdb: 1396 }), { episode: { season: 1, number: 1 } }),
    );
    expect(requests[2].body).toMatchObject({ is_rewatch: false });
  });

  test('a null seasonId is a skipped value — not a throw, not ok — and skips the writes', async () => {
    const requests: Recorded[] = [];
    const deps = fakeDeps({ seasonId: null, onRequest: (r) => requests.push(r) });

    const result = await Effect.runPromise(
      logToSerializd(deps, tvShow({ tmdb: 1396 }), { episode: { season: 9, number: 1 } }),
    );
    expect(result.status).toBe('skipped');
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual(['/show/1396/season/9']);
  });

  test('an item without a tmdb id is skipped with a no-tmdb reason', async () => {
    const requests: Recorded[] = [];
    const deps = fakeDeps({ onRequest: (r) => requests.push(r) });

    const result = await Effect.runPromise(
      logToSerializd(deps, tvShow({ trakt: 1 }), { episode: { season: 1, number: 1 } }),
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: expect.stringContaining('TMDB id'),
    });
    // No join key ⇒ no network at all.
    expect(requests).toHaveLength(0);
  });

  test('a year-based season number is a permanent skip', async () => {
    const result = await Effect.runPromise(
      logToSerializd(fakeDeps({}), tvShow({ tmdb: 1396 }), {
        episode: { season: 2019, number: 3 },
      }),
    );
    expect(result.status).toBe('skipped');
  });

  test('episode-log ok but diary-add failure is a partial-write error, not ok', async () => {
    const requests: Recorded[] = [];
    const deps = fakeDeps({ reviewStatus: 500, onRequest: (r) => requests.push(r) });

    const error = await Effect.runPromise(
      Effect.flip(
        logToSerializd(deps, tvShow({ tmdb: 1396 }), { episode: { season: 1, number: 5 } }),
      ),
    );
    // The episode WAS marked watched, so this is a genuine partial write — the
    // diary entry is absent and reconcile must re-attempt it (R8/R12).
    expect(requests.map((r) => new URL(r.url).pathname)).toContain('/episode_log/add');
    expect(error._tag).toBe('ProviderNetworkError');
  });

  test('a 401 mid-write is a reconnect auth error naming Serializd', async () => {
    const deps = fakeDeps({ episodeLogStatus: 401 });
    const error = await Effect.runPromise(
      Effect.flip(
        logToSerializd(deps, tvShow({ tmdb: 1396 }), { episode: { season: 1, number: 5 } }),
      ),
    );
    expect(error._tag).toBe('ProviderAuthError');
    expect(error.message).toContain('serializd');
  });

  test('a whole-season batch marks episodes watched AND writes a season-level diary entry', async () => {
    const requests: Recorded[] = [];
    const deps = fakeDeps({ onRequest: (r) => requests.push(r) });

    const result = await Effect.runPromise(
      logToSerializd(deps, tvShow({ tmdb: 1396 }), {
        episodes: [
          { season: 1, number: 1 },
          { season: 1, number: 2 },
        ],
      }),
    );
    expect(result).toEqual({ status: 'ok' });
    const paths = requests.map((r) => new URL(r.url).pathname);
    // A whole-season log still produces a diary entry (the reported bug: it
    // used to only mark watched via /watched_v2 with no diary row).
    expect(paths).toContain('/episode_log/add');
    expect(paths).toContain('/show/reviews/add');
    expect(paths).not.toContain('/watched_v2');

    expect(requests.find((r) => r.url.endsWith('/episode_log/add'))!.body).toMatchObject(
      { episode_numbers: [1, 2], season_id: 555, show_id: 1396 },
    );
    const diary = requests.find((r) => r.url.endsWith('/show/reviews/add'))!.body!;
    expect(diary).toMatchObject({ show_id: 1396, season_id: 555, is_log: true });
    // Season-level entry carries no episode_number.
    expect(diary.episode_number).toBeUndefined();
  });

  test('a single-episode log writes an episode-level diary entry (episode_number set)', async () => {
    const requests: Recorded[] = [];
    const deps = fakeDeps({ onRequest: (r) => requests.push(r) });
    await Effect.runPromise(
      logToSerializd(deps, tvShow({ tmdb: 1396 }), {
        // The TV UI passes a one-element `episodes` array, not `episode` — this
        // must still create a diary row (the reported bug).
        episodes: [{ season: 1, number: 5 }],
      }),
    );
    const paths = requests.map((r) => new URL(r.url).pathname);
    expect(paths).toEqual([
      '/show/1396/season/1',
      '/episode_log/add',
      '/show/reviews/add',
    ]);
    expect(requests[2].body).toMatchObject({ episode_number: 5 });
  });
});
