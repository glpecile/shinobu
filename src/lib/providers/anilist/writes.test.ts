import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { TokenStore } from '@/lib/providers/token-store';
import type { NormalizedMediaItem } from '@/types/media';
import type { AniListDeps } from './deps';
import { getEntryState } from './reads';
import { deleteAniListEntry, logToAniList, planOnAniList } from './writes';

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
  /**
   * The four fields the removal guard also has to see (R36.2) — omitted by every
   * add/log fixture, since AniList reports them as null and `getEntryState`
   * normalizes that to "bare".
   */
  score?: number | null;
  notes?: string | null;
  startedAt?: { year: number | null; month: number | null; day: number | null } | null;
  customLists?: unknown;
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
  state: {
    /**
     * A function rather than a value where a test needs the *second* read to
     * answer differently from the first — the only way to prove the guard is a
     * fresh request and not a remembered snapshot (R36.1).
     */
    entry: EntryFixture | null | (() => EntryFixture | null);
    episodes?: number | null;
    /** AniList answering `deleted: false` — a failed delete, not a skip. */
    deleted?: boolean;
  },
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
      if (body.query.includes('DeleteMediaListEntry')) {
        record.mutations.push(body.variables);
        return Response.json({
          data: { DeleteMediaListEntry: { deleted: state.deleted ?? true } },
        });
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
          Media: {
            episodes: state.episodes ?? null,
            mediaListEntry: typeof state.entry === 'function' ? state.entry() : state.entry,
          },
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
      score: 0,
      notes: null,
      startedAt: null,
      customLists: [],
    });
  });

  test('the removal guard fields decode alongside it (R36.2)', async () => {
    // Widening the selection is only useful if the values survive decoding —
    // `customLists` in particular, whose `Json` payload is an object keyed by
    // list name, with membership in the value rather than the key.
    const seen = calls();
    const state = await Effect.runPromise(
      getEntryState(
        watchlistDeps(seen, {
          entry: {
            id: 88_215,
            status: 'PLANNING',
            progress: 0,
            repeat: 0,
            score: 8.5,
            notes: 'recommended by a friend',
            startedAt: { year: 2026, month: null, day: null },
            customLists: { Rewatching: false, 'Winter 2026': true },
          },
        }),
        { mediaId: 104578 },
      ),
    );
    expect(state.entry).toEqual({
      id: 88_215,
      status: 'PLANNING',
      progress: 0,
      repeat: 0,
      score: 8.5,
      notes: 'recommended by a friend',
      startedAt: { year: 2026, month: null, day: null },
      customLists: ['Winter 2026'],
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

/**
 * Plan 0031 R36, the mirror of KTD-2's guard — and the only data-destroying code
 * in the plan. `DeleteMediaListEntry` destroys the *whole* entry, so the subject
 * of every case here is again `mutations`: a refusal that still issued the
 * mutation would be a score, notes and progress gone, reported as a success.
 */
describe('deleteAniListEntry — only a bare PLANNING entry is deletable (R36)', () => {
  test('a bare PLANNING entry is deleted by the id the guard read returned', async () => {
    const seen = calls();
    const result = await Effect.runPromise(
      deleteAniListEntry(
        watchlistDeps(seen, {
          entry: { id: 88_214, status: 'PLANNING', progress: 0, repeat: 0 },
        }),
        { mediaId: 104578 },
      ),
    );
    expect(result).toEqual({ status: 'ok' });
    // The MediaList entry id, never the media id — they are different numbers
    // and AniList would happily delete some other viewer's entry.
    expect(seen.mutations).toEqual([{ id: 88_214 }]);
    expect(seen.entryReads).toBe(1);
  });

  test('no entry at all is a reasoned skip, not an error', async () => {
    const seen = calls();
    const result = await Effect.runPromise(
      deleteAniListEntry(watchlistDeps(seen, { entry: null }), { mediaId: 104578 }),
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: "wasn't on your AniList list",
    });
    expect(seen.mutations).toEqual([]);
  });

  /**
   * The refusal set is wider than status + progress on purpose (R36.2): each of
   * these entries is `PLANNING`/`progress: 0` apart from one field, and that one
   * field is the entry's entire reason for existing.
   */
  const refusals: { name: string; entry: EntryFixture; reason: string }[] = [
    {
      name: 'a CURRENT entry',
      entry: { id: 1, status: 'CURRENT', progress: 5, repeat: 0 },
      reason: 'removing would delete your whole AniList entry, which is CURRENT',
    },
    {
      name: 'a COMPLETED entry',
      entry: { id: 1, status: 'COMPLETED', progress: 24, repeat: 0 },
      reason: 'removing would delete your whole AniList entry, which is COMPLETED',
    },
    {
      name: 'an entry with no status (a score-only or custom-list-only entry)',
      entry: { id: 1, status: null, progress: 0, repeat: 0 },
      reason: 'removing would delete your whole AniList entry, which is not a planning entry',
    },
    {
      name: 'PLANNING with progress',
      entry: { id: 1, status: 'PLANNING', progress: 2, repeat: 0 },
      reason: 'removing would delete your whole AniList entry, which has recorded progress',
    },
    {
      name: 'PLANNING with a rewatch count',
      entry: { id: 1, status: 'PLANNING', progress: 0, repeat: 1 },
      reason: 'removing would delete your whole AniList entry, which records a rewatch',
    },
    {
      name: 'PLANNING carrying a score',
      entry: { id: 1, status: 'PLANNING', progress: 0, repeat: 0, score: 8.5 },
      reason: 'removing would delete your whole AniList entry, which carries a score',
    },
    {
      name: 'PLANNING carrying notes',
      entry: { id: 1, status: 'PLANNING', progress: 0, repeat: 0, notes: 'lent by a friend' },
      reason: 'removing would delete your whole AniList entry, which carries notes',
    },
    {
      name: 'PLANNING with a fuzzy year-only start date',
      entry: {
        id: 1,
        status: 'PLANNING',
        progress: 0,
        repeat: 0,
        startedAt: { year: 2026, month: null, day: null },
      },
      reason: 'removing would delete your whole AniList entry, which has a start date',
    },
    {
      name: 'PLANNING on a custom list',
      entry: {
        id: 1,
        status: 'PLANNING',
        progress: 0,
        repeat: 0,
        customLists: { 'Winter 2026': true },
      },
      reason: 'removing would delete your whole AniList entry, which is on a custom list',
    },
  ];

  for (const refusal of refusals) {
    test(`${refusal.name} is refused with a reason and no mutation`, async () => {
      const seen = calls();
      const result = await Effect.runPromise(
        deleteAniListEntry(watchlistDeps(seen, { entry: refusal.entry }), {
          mediaId: 104578,
        }),
      );
      expect(result).toEqual({ status: 'skipped', reason: refusal.reason });
      expect(seen.mutations).toEqual([]);
    });
  }

  test('an empty-string note and an all-null startedAt are still bare', async () => {
    // The inverse guard: refusing on a field AniList merely *returned* would
    // make every removal manual, which is its own dead end (R17).
    const seen = calls();
    const result = await Effect.runPromise(
      deleteAniListEntry(
        watchlistDeps(seen, {
          entry: {
            id: 88_216,
            status: 'PLANNING',
            progress: 0,
            repeat: 0,
            score: 0,
            notes: '   ',
            startedAt: { year: null, month: null, day: null },
            customLists: { Rewatching: false },
          },
        }),
        { mediaId: 104578 },
      ),
    );
    expect(result).toEqual({ status: 'ok' });
    expect(seen.mutations).toEqual([{ id: 88_216 }]);
  });

  test('an entry that decodes without an id is not a deletion target', async () => {
    const seen = calls();
    const result = await Effect.runPromise(
      deleteAniListEntry(
        watchlistDeps(seen, { entry: { status: 'PLANNING', progress: 0, repeat: 0 } }),
        { mediaId: 104578 },
      ),
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'your AniList entry has no id to remove by',
    });
    expect(seen.mutations).toEqual([]);
  });

  test('AniList answering deleted: false is an error, not a silent success', async () => {
    const seen = calls();
    const result = await Effect.runPromise(
      Effect.either(
        deleteAniListEntry(
          watchlistDeps(seen, {
            entry: { id: 88_214, status: 'PLANNING', progress: 0, repeat: 0 },
            deleted: false,
          }),
          { mediaId: 104578 },
        ),
      ),
    );
    expect(result._tag).toBe('Left');
  });
});

/**
 * Branch 0 and R36.1's freshness rule. A stale guard here does not merely write
 * over an entry — it destroys one, so "the mirror of KTD-2" has to include the
 * fresh-read prohibition, not just the branch table.
 */
describe('deleteAniListEntry — the guard is fresh and fail-closed', () => {
  for (const failure of ['network', 'server', 'rate-limit'] as const) {
    test(`a ${failure} failure errors with no mutation issued`, async () => {
      const seen = calls();
      const result = await Effect.runPromise(
        Effect.either(
          deleteAniListEntry(
            watchlistDeps(
              seen,
              { entry: { id: 88_214, status: 'PLANNING', progress: 0, repeat: 0 } },
              failure,
            ),
            { mediaId: 104578 },
          ),
        ),
      );
      expect(result._tag).toBe('Left');
      expect(seen.mutations).toEqual([]);
      expect(seen.entryReads).toBeGreaterThan(0);
    });
  }

  test('the failure message says the check failed, not that the removal did', async () => {
    const seen = calls();
    const result = await Effect.runPromise(
      Effect.either(
        deleteAniListEntry(
          watchlistDeps(
            seen,
            { entry: { id: 88_214, status: 'PLANNING', progress: 0, repeat: 0 } },
            'network',
          ),
          { mediaId: 104578 },
        ),
      ),
    );
    if (result._tag !== 'Left') throw new Error('expected a failure');
    expect(result.left.message).toContain('could not check your AniList entry');
  });

  test('a stale PLANNING snapshot never authorizes a delete — every call re-reads', async () => {
    // The 10:05 scenario from R36.1: the surface's cached snapshot says
    // PLANNING/0 with entry id 700, but the user started the show on anilist.co
    // since. The guard must issue its own request each time and honour *that*
    // answer, so the second removal refuses rather than destroying the progress.
    const seen = calls();
    const entries: (EntryFixture | null)[] = [
      { id: 700, status: 'PLANNING', progress: 0, repeat: 0 },
      { id: 700, status: 'CURRENT', progress: 3, repeat: 0 },
    ];
    let read = 0;
    const deps = watchlistDeps(seen, {
      entry: () => entries[Math.min(read++, entries.length - 1)] ?? null,
    });

    const first = await Effect.runPromise(deleteAniListEntry(deps, { mediaId: 104578 }));
    const second = await Effect.runPromise(deleteAniListEntry(deps, { mediaId: 104578 }));

    expect(first).toEqual({ status: 'ok' });
    expect(second).toEqual({
      status: 'skipped',
      reason: 'removing would delete your whole AniList entry, which is CURRENT',
    });
    // Two calls, two reads: nothing is remembered between them.
    expect(seen.entryReads).toBe(2);
    expect(seen.mutations).toEqual([{ id: 700 }]);
  });

  test('the delete uses the fresh read id, not the id a cached entry carried', async () => {
    // `AniListCurrentEntry.entryId` is a hint for the surface and can point at
    // an entry since re-created (R36.1); only the guard read's id is evidence.
    const seen = calls();
    const staleEntryId = 700;
    const result = await Effect.runPromise(
      deleteAniListEntry(
        watchlistDeps(seen, {
          entry: { id: 901, status: 'PLANNING', progress: 0, repeat: 0 },
        }),
        { mediaId: 104578 },
      ),
    );
    expect(result).toEqual({ status: 'ok' });
    expect(seen.mutations).toEqual([{ id: 901 }]);
    expect(seen.mutations).not.toContainEqual({ id: staleEntryId });
  });
});
