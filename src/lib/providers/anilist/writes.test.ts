import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { TokenStore } from '@/lib/providers/token-store';
import type { NormalizedMediaItem } from '@/types/media';
import type { AniListDeps } from './deps';
import { getEntryState } from './reads';
import { logToAniList, planOnAniList } from './writes';

const TOKENS: TokenStore = {
  get: () => ({ accessToken: 'tok' }),
  set: () => {},
  clear: () => {},
};

interface EntryFixture {
  /** The MediaList entry id — what an un-watchlist deletes by (plan 0031 R36). */
  id?: number;
  status: string | null;
  progress: number;
  repeat: number;
}

/**
 * Fake AniList: replies to the entry-state query from `entry`/`episodes` and
 * records the SaveMediaListEntry variables.
 */
function capturingDeps(
  captured: { variables: unknown },
  state: { entry: EntryFixture | null; episodes: number | null },
): AniListDeps {
  return {
    tokens: TOKENS,
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        query: string;
        variables: unknown;
      };
      if (body.query.includes('SaveMediaListEntry')) {
        captured.variables = body.variables;
        return Response.json({ data: { SaveMediaListEntry: { id: 1 } } });
      }
      return Response.json({
        data: { Media: { episodes: state.episodes, mediaListEntry: state.entry } },
      });
    },
  };
}

const FILM: NormalizedMediaItem = {
  id: 'anilist-199',
  title: 'Spirited Away',
  coverImage: '',
  type: 'ANIME',
  isFilm: true,
  currentProgress: 0,
  progressUnit: 'episode',
  lastUpdated: '2026-07-14T00:00:00Z',
  externalIds: { anilist: 199 },
};

const SERIES: NormalizedMediaItem = {
  id: 'anilist-104578',
  title: 'Attack on Titan Final Season',
  coverImage: '',
  type: 'ANIME',
  currentProgress: 0,
  progressUnit: 'episode',
  lastUpdated: '2026-07-14T00:00:00Z',
  externalIds: { anilist: 104578 },
};

describe('logToAniList films', () => {
  test('first watch saves COMPLETED without touching repeat', async () => {
    const captured = { variables: null as unknown };
    await Effect.runPromise(
      logToAniList(capturingDeps(captured, { entry: null, episodes: 1 }), FILM),
    );
    expect(captured.variables).toEqual({ mediaId: 199, status: 'COMPLETED' });
  });

  test('parity rewatch bumps repeat from the current entry', async () => {
    const captured = { variables: null as unknown };
    await Effect.runPromise(
      logToAniList(
        capturingDeps(captured, {
          entry: { status: 'COMPLETED', progress: 1, repeat: 2 },
          episodes: 1,
        }),
        FILM,
        { rewatch: true },
      ),
    );
    expect(captured.variables).toEqual({
      mediaId: 199,
      status: 'COMPLETED',
      repeat: 3,
    });
  });
});

describe('logToAniList series', () => {
  test('mid-season episode saves CURRENT progress', async () => {
    const captured = { variables: null as unknown };
    await Effect.runPromise(
      logToAniList(
        capturingDeps(captured, {
          entry: { status: 'CURRENT', progress: 4, repeat: 0 },
          episodes: 16,
        }),
        SERIES,
        { progress: 5 },
      ),
    );
    expect(captured.variables).toEqual({
      mediaId: 104578,
      status: 'CURRENT',
      progress: 5,
    });
  });

  test('final episode flips the entry to COMPLETED', async () => {
    const captured = { variables: null as unknown };
    await Effect.runPromise(
      logToAniList(
        capturingDeps(captured, {
          entry: { status: 'CURRENT', progress: 15, repeat: 0 },
          episodes: 16,
        }),
        SERIES,
        { progress: 16 },
      ),
    );
    expect(captured.variables).toEqual({
      mediaId: 104578,
      status: 'COMPLETED',
      progress: 16,
    });
  });

  test('parity rewatch re-enters REPEATING at the episode', async () => {
    const captured = { variables: null as unknown };
    await Effect.runPromise(
      logToAniList(
        capturingDeps(captured, {
          entry: { status: 'COMPLETED', progress: 16, repeat: 0 },
          episodes: 16,
        }),
        SERIES,
        { progress: 1, rewatch: true },
      ),
    );
    expect(captured.variables).toEqual({
      mediaId: 104578,
      status: 'REPEATING',
      progress: 1,
    });
  });

  test('a series log without progress fails loudly', async () => {
    const captured = { variables: null as unknown };
    const result = await Effect.runPromise(
      Effect.either(
        logToAniList(capturingDeps(captured, { entry: null, episodes: 16 }), SERIES),
      ),
    );
    expect(result._tag).toBe('Left');
  });

  test('an item without an anilist id fails loudly', async () => {
    const captured = { variables: null as unknown };
    const result = await Effect.runPromise(
      Effect.either(
        logToAniList(
          capturingDeps(captured, { entry: null, episodes: 1 }),
          { ...FILM, externalIds: {} },
        ),
      ),
    );
    expect(result._tag).toBe('Left');
  });
});

/**
 * How the guard read fails when a test asks it to — the three shapes plan 0031
 * KTD-2 branch 0 names (network, 5xx, 429). The 429 goes through
 * `withRateLimitRetry`'s one bounded retry, so it is also the case that proves
 * a *retried* guard failure still never reaches the mutation.
 */
type GuardFailure = 'network' | 'server' | 'rate-limit';

interface WatchlistCalls {
  entryReads: number;
  mutations: unknown[];
}

function watchlistDeps(
  record: WatchlistCalls,
  state: { entry: EntryFixture | null; episodes?: number | null },
  failure?: GuardFailure,
): AniListDeps {
  return {
    tokens: TOKENS,
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        query: string;
        variables: unknown;
      };
      if (body.query.includes('SaveMediaListEntry')) {
        record.mutations.push(body.variables);
        return Response.json({ data: { SaveMediaListEntry: { id: 1 } } });
      }
      record.entryReads += 1;
      if (failure === 'network') throw new Error('socket hang up');
      if (failure === 'server') {
        return Response.json({ data: null }, { status: 500 });
      }
      if (failure === 'rate-limit') {
        // A sub-second Retry-After keeps the bounded retry's sleep out of the
        // suite's runtime; the branch under test is identical at any value.
        return Response.json({}, { status: 429, headers: { 'Retry-After': '0.01' } });
      }
      return Response.json({
        data: {
          Media: { episodes: state.episodes ?? null, mediaListEntry: state.entry },
        },
      });
    },
  };
}

const MANGA: NormalizedMediaItem = {
  id: 'anilist-30013',
  title: 'One Piece',
  coverImage: '',
  type: 'MANGA',
  currentProgress: 0,
  progressUnit: 'chapter',
  lastUpdated: '2026-07-14T00:00:00Z',
  externalIds: { anilist: 30013 },
};

function calls(): WatchlistCalls {
  return { entryReads: 0, mutations: [] };
}

/**
 * Plan 0031 KTD-2. `MediaList.status` is single-valued, so every one of these
 * cases is really the same assertion from a different angle: an entry that
 * exists is never written over, and a guard that could not answer is not an
 * excuse to write. The `mutations` array is the real subject — a skip that
 * still issued the mutation would be a status clobber reported as success.
 */
describe('planOnAniList — the exclusive-status guard (KTD-2)', () => {
  test('no entry writes PLANNING with progress and repeat omitted', async () => {
    const seen = calls();
    const result = await Effect.runPromise(
      planOnAniList(watchlistDeps(seen, { entry: null }), SERIES),
    );
    expect(result).toEqual({ status: 'ok' });
    expect(seen.mutations).toEqual([{ mediaId: 104578, status: 'PLANNING' }]);
  });

  test('manga takes the same PLANNING status — one enum, no per-type variant', async () => {
    const seen = calls();
    await Effect.runPromise(planOnAniList(watchlistDeps(seen, { entry: null }), MANGA));
    expect(seen.mutations).toEqual([{ mediaId: 30013, status: 'PLANNING' }]);
  });

  test('an entry already PLANNING skips with a reason and issues no mutation', async () => {
    const seen = calls();
    const result = await Effect.runPromise(
      planOnAniList(
        watchlistDeps(seen, { entry: { status: 'PLANNING', progress: 0, repeat: 0 } }),
        SERIES,
      ),
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'already on your AniList planning list',
    });
    expect(seen.mutations).toEqual([]);
  });

  test('a CURRENT entry with progress skips, names the status, and never writes', async () => {
    // The clobber this guard exists for: PLANNING over CURRENT moves a series
    // the user is five episodes into out of Watching.
    const seen = calls();
    const result = await Effect.runPromise(
      planOnAniList(
        watchlistDeps(seen, {
          entry: { status: 'CURRENT', progress: 5, repeat: 0 },
          episodes: 24,
        }),
        SERIES,
      ),
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'AniList already tracks this as CURRENT',
    });
    expect(seen.mutations).toEqual([]);
  });

  test('a COMPLETED entry skips — a want-to-watch write must not contradict it', async () => {
    const seen = calls();
    const result = await Effect.runPromise(
      planOnAniList(
        watchlistDeps(seen, {
          entry: { status: 'COMPLETED', progress: 24, repeat: 0 },
          episodes: 24,
        }),
        SERIES,
      ),
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'AniList already tracks this as COMPLETED',
    });
    expect(seen.mutations).toEqual([]);
  });

  test('a DROPPED entry with progress skips — that progress was kept on purpose', async () => {
    const seen = calls();
    const result = await Effect.runPromise(
      planOnAniList(
        watchlistDeps(seen, {
          entry: { status: 'DROPPED', progress: 3, repeat: 0 },
          episodes: 24,
        }),
        SERIES,
      ),
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'AniList already tracks this as DROPPED',
    });
    expect(seen.mutations).toEqual([]);
  });

  test('an entry with no status and no progress still skips (collapsed branch 3)', async () => {
    // A score-only or custom-list-only entry: the one shape an earlier draft
    // carved out as writable, and exactly the entry whose *only* content is the
    // fields an omitting SaveMediaListEntry might null.
    const seen = calls();
    const result = await Effect.runPromise(
      planOnAniList(
        watchlistDeps(seen, { entry: { status: null, progress: 0, repeat: 0 } }),
        SERIES,
      ),
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'AniList already tracks this',
    });
    expect(seen.mutations).toEqual([]);
  });
});

/**
 * Branch 0, fail-closed. The log path's documented rule — a failed state read
 * counts as "doesn't have it", so the write still fires — is safe there
 * (duplicate history row) and catastrophic here (status clobber). These cases
 * are what stops it being copied across.
 */
describe('planOnAniList — a guard read that fails never falls through to the write', () => {
  for (const failure of ['network', 'server', 'rate-limit'] as const) {
    test(`a ${failure} failure errors with no mutation issued`, async () => {
      const seen = calls();
      const result = await Effect.runPromise(
        Effect.either(planOnAniList(watchlistDeps(seen, { entry: null }, failure), SERIES)),
      );
      expect(result._tag).toBe('Left');
      expect(seen.mutations).toEqual([]);
      expect(seen.entryReads).toBeGreaterThan(0);
    });
  }

  test('the failure message says the check failed, not that the write did', async () => {
    const seen = calls();
    const result = await Effect.runPromise(
      Effect.either(planOnAniList(watchlistDeps(seen, { entry: null }, 'network'), SERIES)),
    );
    if (result._tag !== 'Left') throw new Error('expected a failure');
    expect(result.left.message).toContain('could not check your AniList entry');
  });

  test('an item with no anilist id fails loudly without any request', async () => {
    const seen = calls();
    const result = await Effect.runPromise(
      Effect.either(
        planOnAniList(watchlistDeps(seen, { entry: null }), {
          ...SERIES,
          externalIds: {},
        }),
      ),
    );
    expect(result._tag).toBe('Left');
    expect(seen.entryReads).toBe(0);
    expect(seen.mutations).toEqual([]);
  });
});

describe('getEntryState carries the MediaList entry id', () => {
  test('the id is threaded into AniListEntryState', async () => {
    // Not decoration: DeleteMediaListEntry takes this id, not the media id
    // (plan 0031 R34/R36), and nothing selected it before this unit.
    const seen = calls();
    const state = await Effect.runPromise(
      getEntryState(
        watchlistDeps(seen, {
          entry: { id: 88_214, status: 'CURRENT', progress: 5, repeat: 0 },
          episodes: 24,
        }),
        { mediaId: 104578 },
      ),
    );
    expect(state.entry).toEqual({
      id: 88_214,
      status: 'CURRENT',
      progress: 5,
      repeat: 0,
    });
  });

  test('an entry that decodes without an id is not a deletion target', async () => {
    const seen = calls();
    const state = await Effect.runPromise(
      getEntryState(
        watchlistDeps(seen, { entry: { status: 'PLANNING', progress: 0, repeat: 0 } }),
        { mediaId: 104578 },
      ),
    );
    expect(state.entry?.id).toBeNull();
  });
});
