import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { TokenStore } from '@/lib/providers/token-store';
import type { NormalizedMediaItem } from '@/types/media';
import type { AniListDeps } from './deps';
import { logToAniList } from './writes';

const TOKENS: TokenStore = {
  get: () => ({ accessToken: 'tok' }),
  set: () => {},
  clear: () => {},
};

interface EntryFixture {
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
