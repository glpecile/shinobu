import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';
import {
  anilistHasEpisodes,
  anilistHasFilm,
  reconcileLogTargets,
  traktHasEpisodes,
  traktHasFilm,
} from './reconcile';

describe('reconcileLogTargets (the plan 0011 sync rule)', () => {
  test('nobody has it → log everywhere', () => {
    expect(
      reconcileLogTargets([
        { provider: 'trakt', hasIt: false },
        { provider: 'anilist', hasIt: false },
      ]),
    ).toEqual([
      { provider: 'trakt', action: 'log' },
      { provider: 'anilist', action: 'log' },
    ]);
  });

  test('one side ahead → catch up the other only, never double-log', () => {
    expect(
      reconcileLogTargets([
        { provider: 'trakt', hasIt: true },
        { provider: 'anilist', hasIt: false },
      ]),
    ).toEqual([
      { provider: 'trakt', action: 'skip' },
      { provider: 'anilist', action: 'log' },
    ]);
  });

  test('parity → rewatch on all', () => {
    expect(
      reconcileLogTargets([
        { provider: 'trakt', hasIt: true },
        { provider: 'anilist', hasIt: true },
      ]),
    ).toEqual([
      { provider: 'trakt', action: 'rewatch' },
      { provider: 'anilist', action: 'rewatch' },
    ]);
  });

  // Serializd rides the same provider-agnostic rule (plan 0017). When its
  // two-call log left the diary entry absent, `providerHasWatch` returns false
  // (R12), so reconcile marks it `log` to re-attempt — while a provider already
  // in sync is skipped (AE6 catch-up side).
  test('a Serializd episode whose diary entry is absent re-logs, Trakt skips', () => {
    expect(
      reconcileLogTargets([
        { provider: 'trakt', hasIt: true },
        { provider: 'serializd', hasIt: false },
      ]),
    ).toEqual([
      { provider: 'trakt', action: 'skip' },
      { provider: 'serializd', action: 'log' },
    ]);
  });

  test('single unwatched provider logs normally (no rewatch)', () => {
    expect(reconcileLogTargets([{ provider: 'trakt', hasIt: false }])).toEqual([
      { provider: 'trakt', action: 'log' },
    ]);
  });

  test('single watched provider is a rewatch (parity with itself)', () => {
    expect(reconcileLogTargets([{ provider: 'anilist', hasIt: true }])).toEqual([
      { provider: 'anilist', action: 'rewatch' },
    ]);
  });

  // Plan 0027 R4: a provider whose canonical season couldn't be mapped is a
  // reasoned skip, and `useLogMedia` keeps it out of these records entirely —
  // so an AniList entry already at parity still rewatches instead of being
  // dragged into a catch-up by a provider that was never comparable.
  test('mapping-skipped providers are absent from the records, so parity survives', () => {
    expect(reconcileLogTargets([{ provider: 'anilist', hasIt: true }])).toEqual([
      { provider: 'anilist', action: 'rewatch' },
    ]);
    // Had trakt/serializd been included as "missing", the rewatch would have
    // collapsed into a catch-up write on AniList.
    expect(
      reconcileLogTargets([
        { provider: 'trakt', hasIt: false },
        { provider: 'anilist', hasIt: true },
      ]),
    ).toEqual([
      { provider: 'trakt', action: 'log' },
      { provider: 'anilist', action: 'skip' },
    ]);
  });
});

function movie(externalIds: NormalizedMediaItem['externalIds']): NormalizedMediaItem {
  return {
    id: 'x',
    title: 'x',
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 1,
    progressUnit: 'episode',
    lastUpdated: '2026-07-14T00:00:00Z',
    externalIds,
  };
}

describe('traktHasFilm', () => {
  const watched = [movie({ trakt: 1, tmdb: 100 })];

  test('matches on trakt id', () => {
    expect(traktHasFilm(watched, movie({ trakt: 1 }))).toBe(true);
  });

  test('matches on tmdb when the item has no trakt id (ani.zip-mapped anime)', () => {
    expect(traktHasFilm(watched, movie({ tmdb: 100, anilist: 5 }))).toBe(true);
  });

  test('no shared id → not watched', () => {
    expect(traktHasFilm(watched, movie({ tmdb: 999 }))).toBe(false);
  });
});

describe('traktHasEpisodes', () => {
  const completed = new Set(['1-1', '1-2', '1-3']);

  test('all intended episodes completed', () => {
    expect(
      traktHasEpisodes(completed, [
        { season: 1, number: 2 },
        { season: 1, number: 3 },
      ]),
    ).toBe(true);
  });

  test('any missing episode → not recorded', () => {
    expect(traktHasEpisodes(completed, [{ season: 1, number: 4 }])).toBe(false);
  });

  // Plan 0027 R4: the sequel-season bug, from the reconcile side. Before the
  // translation step every AniList-origin log arrived as season 1, so a
  // season-2 episode 3 matched the season-1 episode 3 the user watched last
  // year and was skipped as "already in sync".
  test('a canonical season-2 intent is not satisfied by season-1 history', () => {
    expect(traktHasEpisodes(completed, [{ season: 2, number: 3 }])).toBe(false);
  });

  test('the same intent against real season-2 history is in sync', () => {
    expect(traktHasEpisodes(new Set(['2-1', '2-2', '2-3']), [{ season: 2, number: 3 }])).toBe(
      true,
    );
  });
});

describe('anilist snapshots', () => {
  test('film: COMPLETED or REPEATING counts, CURRENT does not', () => {
    expect(anilistHasFilm({ status: 'COMPLETED', progress: 1 })).toBe(true);
    expect(anilistHasFilm({ status: 'REPEATING', progress: 0 })).toBe(true);
    expect(anilistHasFilm({ status: 'PLANNING', progress: 0 })).toBe(false);
    expect(anilistHasFilm(null)).toBe(false);
  });

  test('episodes: progress covers the highest intended entry episode', () => {
    expect(anilistHasEpisodes({ status: 'CURRENT', progress: 5 }, [5])).toBe(true);
    expect(anilistHasEpisodes({ status: 'CURRENT', progress: 4 }, [5])).toBe(false);
    expect(anilistHasEpisodes({ status: 'COMPLETED', progress: 0 }, [12])).toBe(true);
    expect(anilistHasEpisodes(null, [1])).toBe(false);
    expect(anilistHasEpisodes({ status: 'CURRENT', progress: 5 }, [])).toBe(false);
  });

  // Plan 0027 KTD5: AniList stays in its own domain. The same log that asks
  // Trakt about S02E03 asks AniList about entry progress 3 — the sequel entry
  // counts its own episodes from 1, so "3" here is never "S1E3".
  test('a sequel entry compares against entry-relative progress, not the canonical season', () => {
    expect(anilistHasEpisodes({ status: 'CURRENT', progress: 3 }, [3])).toBe(true);
    expect(anilistHasEpisodes({ status: 'CURRENT', progress: 2 }, [3])).toBe(false);
  });
});
