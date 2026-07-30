import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { NormalizedMediaItem } from '@/types/media';
import type { SerializdDeps, SerializdSession } from './deps';
import {
  addToSerializdWatchlist,
  logToSerializd,
  removeFromSerializdWatchlist,
} from './writes';

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

type ShowSeason = { id?: number; seasonNumber?: number; episodeCount?: number };
type WatchedSeason = { seasonNumber?: number; watchedEpisodes?: number[] };

/**
 * A show + progress pair for the KTD-10 guard, with either read switchable to a
 * failure so branch 0 (fail-closed, no POST) can be asserted on both legs.
 */
function watchlistDeps(opts: {
  seasons?: ShowSeason[];
  watchedSeasons?: WatchedSeason[];
  showStatus?: number;
  progressStatus?: number;
  writeStatus?: number;
  onRequest?: (r: Recorded) => void;
}): SerializdDeps {
  return {
    baseUrl: 'https://api.test',
    session: SESSION,
    fetch: async (input, init) => {
      const url = String(input);
      const path = new URL(url).pathname;
      const method = init?.method ?? 'GET';
      const body =
        init?.body != null
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : undefined;
      opts.onRequest?.({ url, method, body });

      if (path.endsWith('/progress')) {
        return opts.progressStatus != null && opts.progressStatus !== 200
          ? new Response('{}', { status: opts.progressStatus })
          : Response.json({ watchedSeasons: opts.watchedSeasons ?? [] });
      }
      if (method === 'GET') {
        return opts.showStatus != null && opts.showStatus !== 200
          ? new Response('{}', { status: opts.showStatus })
          : Response.json({ seasons: opts.seasons ?? [] });
      }
      return new Response('{}', { status: opts.writeStatus ?? 200 });
    },
  };
}

const THREE_SEASONS: ShowSeason[] = [
  { id: 11, seasonNumber: 1, episodeCount: 7 },
  { id: 12, seasonNumber: 2, episodeCount: 13 },
  { id: 13, seasonNumber: 3, episodeCount: 13 },
];

function requestLines(requests: Recorded[]): string[] {
  return requests.map((r) => `${r.method} ${new URL(r.url).pathname}`);
}

describe('addToSerializdWatchlist', () => {
  test('a partly-watched show sends only the unwatched season ids, and the ok carries the partial reason', async () => {
    const requests: Recorded[] = [];
    const deps = watchlistDeps({
      seasons: THREE_SEASONS,
      watchedSeasons: [{ seasonNumber: 1, watchedEpisodes: [1, 2, 3] }],
      onRequest: (r) => requests.push(r),
    });

    const result = await Effect.runPromise(
      addToSerializdWatchlist(deps, tvShow({ tmdb: 1396 })),
    );

    // Enumerate, guard, write — three requests (KTD-7/KTD-10 cost model).
    expect(requestLines(requests)).toEqual([
      'GET /show/1396',
      'GET /user/gian/show/1396/progress',
      'POST /watchlist_v2',
    ]);
    expect(requests[2].body).toEqual({ show_id: 1396, season_ids: [12, 13] });
    // Never a bare ok when the guard filtered something out (R16).
    expect(result).toEqual({
      status: 'ok',
      reason: 'S1 is already watched on Serializd',
    });
  });

  test('a season in watchedSeasons with an EMPTY watchedEpisodes array is watched and is never sent', async () => {
    // The season-level-watched case `getWatchedEpisodeKeys` cannot see: a season
    // marked watched wholesale (POST /watched_v2) writes no episode rows, so the
    // flattened key set drops it and the guard would fail OPEN (R21/KTD-10).
    const requests: Recorded[] = [];
    const deps = watchlistDeps({
      seasons: THREE_SEASONS,
      watchedSeasons: [
        { seasonNumber: 1, watchedEpisodes: [] },
        { seasonNumber: 2 },
      ],
      onRequest: (r) => requests.push(r),
    });

    const result = await Effect.runPromise(
      addToSerializdWatchlist(deps, tvShow({ tmdb: 1396 })),
    );

    expect(requests[2].body).toEqual({ show_id: 1396, season_ids: [13] });
    expect(result).toEqual({
      status: 'ok',
      reason: 'S1 and S2 are already watched on Serializd',
    });
  });

  test('a season whose watched-episode count reaches episodeCount counts as watched', async () => {
    const requests: Recorded[] = [];
    const deps = watchlistDeps({
      seasons: [
        { id: 11, seasonNumber: 1, episodeCount: 2 },
        { id: 12, seasonNumber: 2, episodeCount: 10 },
      ],
      watchedSeasons: [{ seasonNumber: 1, watchedEpisodes: [1, 2] }],
      onRequest: (r) => requests.push(r),
    });

    await Effect.runPromise(addToSerializdWatchlist(deps, tvShow({ tmdb: 1396 })));
    expect(requests[2].body).toEqual({ show_id: 1396, season_ids: [12] });
  });

  test('specials (season 0) are never sent — Serializd itself says "Specials not affected"', async () => {
    const requests: Recorded[] = [];
    const deps = watchlistDeps({
      seasons: [{ id: 10, seasonNumber: 0, episodeCount: 4 }, ...THREE_SEASONS],
      onRequest: (r) => requests.push(r),
    });

    const result = await Effect.runPromise(
      addToSerializdWatchlist(deps, tvShow({ tmdb: 1396 })),
    );
    expect(requests[2].body).toEqual({ show_id: 1396, season_ids: [11, 12, 13] });
    // Nothing was *watched*, so the ok stays bare.
    expect(result).toEqual({ status: 'ok' });
  });

  test('a year-based season is never sent', async () => {
    const requests: Recorded[] = [];
    const deps = watchlistDeps({
      seasons: [
        { id: 11, seasonNumber: 1, episodeCount: 7 },
        { id: 90, seasonNumber: 2019, episodeCount: 20 },
      ],
      onRequest: (r) => requests.push(r),
    });

    await Effect.runPromise(addToSerializdWatchlist(deps, tvShow({ tmdb: 1396 })));
    expect(requests[2].body).toEqual({ show_id: 1396, season_ids: [11] });
  });

  test('a season with no usable id or number is dropped rather than guessed at', async () => {
    const requests: Recorded[] = [];
    const deps = watchlistDeps({
      seasons: [
        { seasonNumber: 1, episodeCount: 7 },
        { id: 12, episodeCount: 13 },
        { id: 13, seasonNumber: 3, episodeCount: 13 },
      ],
      onRequest: (r) => requests.push(r),
    });

    await Effect.runPromise(addToSerializdWatchlist(deps, tvShow({ tmdb: 1396 })));
    expect(requests[2].body).toEqual({ show_id: 1396, season_ids: [13] });
  });

  test('a fully-watched show is a reasoned skip with NO POST issued', async () => {
    const requests: Recorded[] = [];
    const deps = watchlistDeps({
      seasons: THREE_SEASONS,
      watchedSeasons: [
        { seasonNumber: 1, watchedEpisodes: [1] },
        { seasonNumber: 2, watchedEpisodes: [] },
        { seasonNumber: 3, watchedEpisodes: [1, 2] },
      ],
      onRequest: (r) => requests.push(r),
    });

    const result = await Effect.runPromise(
      addToSerializdWatchlist(deps, tvShow({ tmdb: 1396 })),
    );
    expect(result).toEqual({ status: 'skipped', reason: 'already watched on Serializd' });
    expect(requestLines(requests).some((p) => p.startsWith('POST'))).toBe(false);
  });

  test('a catalogue with nothing watchlistable skips with its own reason, not "already watched"', async () => {
    const deps = watchlistDeps({ seasons: [{ id: 10, seasonNumber: 0, episodeCount: 4 }] });
    const result = await Effect.runPromise(
      addToSerializdWatchlist(deps, tvShow({ tmdb: 1396 })),
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'Serializd lists no watchlistable season for this show yet',
    });
  });

  test('a failed progress read is an error outcome with NO POST — the guard is fail-closed', async () => {
    const requests: Recorded[] = [];
    const deps = watchlistDeps({
      seasons: THREE_SEASONS,
      progressStatus: 500,
      onRequest: (r) => requests.push(r),
    });

    const error = await Effect.runPromise(
      Effect.flip(addToSerializdWatchlist(deps, tvShow({ tmdb: 1396 }))),
    );
    expect(error._tag).toBe('ProviderNetworkError');
    expect(requestLines(requests).some((p) => p.startsWith('POST'))).toBe(false);
  });

  test('a 404 progress read means "never touched" — all seasons eligible, write proceeds', async () => {
    // Observed live (2026-07-30): /user/{u}/show/{tmdbId}/progress answers 404
    // for a show with no progress recorded, while GET show/{tmdbId} is 200.
    // That is the API's definitive negative, not an outage — treating it as
    // branch-0 poison would refuse the most common add (a never-watched show).
    const requests: Recorded[] = [];
    const deps = watchlistDeps({
      seasons: THREE_SEASONS,
      progressStatus: 404,
      onRequest: (r) => requests.push(r),
    });

    const result = await Effect.runPromise(
      addToSerializdWatchlist(deps, tvShow({ tmdb: 1396 })),
    );
    expect(result).toEqual({ status: 'ok' });
    const post = requests.find((r) => r.method === 'POST');
    expect(post?.body).toEqual({ show_id: 1396, season_ids: [11, 12, 13] });
  });

  test('a failed show enumeration is an error outcome with NO POST and no progress read', async () => {
    const requests: Recorded[] = [];
    const deps = watchlistDeps({ showStatus: 500, onRequest: (r) => requests.push(r) });

    const error = await Effect.runPromise(
      Effect.flip(addToSerializdWatchlist(deps, tvShow({ tmdb: 1396 }))),
    );
    expect(error._tag).toBe('ProviderNetworkError');
    expect(requestLines(requests)).toEqual(['GET /show/1396']);
  });

  test('a 401 on the guard read is a reconnect auth error, not a generic guard failure', async () => {
    const deps = watchlistDeps({ seasons: THREE_SEASONS, progressStatus: 401 });
    const error = await Effect.runPromise(
      Effect.flip(addToSerializdWatchlist(deps, tvShow({ tmdb: 1396 }))),
    );
    expect(error._tag).toBe('ProviderAuthError');
    expect(error.message).toContain('serializd');
  });

  test('an item without a tmdb id is skipped with a no-tmdb reason and no network at all', async () => {
    const requests: Recorded[] = [];
    const deps = watchlistDeps({ seasons: THREE_SEASONS, onRequest: (r) => requests.push(r) });

    const result = await Effect.runPromise(
      addToSerializdWatchlist(deps, tvShow({ trakt: 1 })),
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: expect.stringContaining('TMDB id'),
    });
    expect(requests).toHaveLength(0);
  });
});

describe('removeFromSerializdWatchlist', () => {
  test('posts watchlist/remove_v2 with async:true and the SAME filtered season set as the add', async () => {
    const requests: Recorded[] = [];
    const deps = watchlistDeps({
      seasons: THREE_SEASONS,
      watchedSeasons: [{ seasonNumber: 1, watchedEpisodes: [] }],
      onRequest: (r) => requests.push(r),
    });

    const result = await Effect.runPromise(
      removeFromSerializdWatchlist(deps, tvShow({ tmdb: 1396 })),
    );

    expect(requestLines(requests)).toEqual([
      'GET /show/1396',
      'GET /user/gian/show/1396/progress',
      'POST /watchlist/remove_v2',
    ]);
    // Watched S1 is left alone on the way out too — removal is not assumed
    // hazard-free (R34's named risk; U10 step 5 probes it).
    expect(requests[2].body).toEqual({
      show_id: 1396,
      season_ids: [12, 13],
      async: true,
    });
    expect(result).toEqual({
      status: 'ok',
      reason: 'S1 is already watched on Serializd',
    });
  });

  test('a failed guard read is an error with NO POST, exactly like the add', async () => {
    const requests: Recorded[] = [];
    const deps = watchlistDeps({
      seasons: THREE_SEASONS,
      progressStatus: 500,
      onRequest: (r) => requests.push(r),
    });

    const error = await Effect.runPromise(
      Effect.flip(removeFromSerializdWatchlist(deps, tvShow({ tmdb: 1396 }))),
    );
    expect(error._tag).toBe('ProviderNetworkError');
    expect(requestLines(requests).some((p) => p.startsWith('POST'))).toBe(false);
  });

  test('nothing eligible is a reasoned skip, never a blind removal', async () => {
    const requests: Recorded[] = [];
    const deps = watchlistDeps({
      seasons: THREE_SEASONS,
      watchedSeasons: [
        { seasonNumber: 1 },
        { seasonNumber: 2 },
        { seasonNumber: 3 },
      ],
      onRequest: (r) => requests.push(r),
    });

    const result = await Effect.runPromise(
      removeFromSerializdWatchlist(deps, tvShow({ tmdb: 1396 })),
    );
    expect(result).toEqual({ status: 'skipped', reason: 'already watched on Serializd' });
    expect(requestLines(requests).some((p) => p.startsWith('POST'))).toBe(false);
  });
});
