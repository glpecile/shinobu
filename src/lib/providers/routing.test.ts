import { describe, expect, it } from 'bun:test';

import type { MediaType } from '@/types/media';
import { PROVIDERS } from './registry';
import type { ProviderId } from './types';
import {
  providersForFeed,
  providersForWrite,
  resolveWriteTargets,
  splitWriteTargets,
  type WriteCapability,
} from './routing';

const ALL: readonly ProviderId[] = ['trakt', 'anilist', 'letterboxd'];
const ALL4: readonly ProviderId[] = ['trakt', 'anilist', 'letterboxd', 'serializd'];
const ALL5: readonly ProviderId[] = ['trakt', 'anilist', 'letterboxd', 'serializd', 'simkl'];

/** Routing inputs are enriched items — externalIds drive cross-provider matches. */
const ids = (externalIds: Record<string, number | string> = {}) => ({ externalIds });

// Letterboxd writes movies as diary entries (registry canWrite: true, plan
// 0012 session-capture path), so it is a log target for movies and anime films
// alongside Trakt.
describe("providersForWrite('log')", () => {
  it('an unmapped anime film stays AniList-only (no movie-side id)', () => {
    expect(
      providersForWrite({ type: 'ANIME', isFilm: true, ...ids({ anilist: 1 }) }, ALL, 'log'),
    ).toEqual(['anilist']);
  });

  it('a TV show reverse-mapped to AniList also routes there', () => {
    expect(
      providersForWrite({ type: 'TV', ...ids({ trakt: 1, anilist: 2 }) }, ALL, 'log'),
    ).toEqual(['trakt', 'anilist']);
  });

  it('a movie with isFilm set routes the same as a plain movie', () => {
    expect(
      providersForWrite({ type: 'MOVIE', isFilm: true, ...ids({ trakt: 1 }) }, ALL, 'log'),
    ).toEqual(['trakt', 'letterboxd']);
  });

  // The ChaO (2025) shape: a TMDB/Trakt-first anime film whose AniList id the
  // enrichment fallback discovered (plan 0024 U6). No routing change was
  // needed — `effectiveTypes` already widens a MOVIE on `externalIds.anilist`.
  it('routes an anime film discovered from the movie side to all three movie targets, never Serializd', () => {
    expect(
      providersForWrite(
        { type: 'MOVIE', ...ids({ trakt: 1, tmdb: 2, anilist: 3 }) },
        ['trakt', 'anilist', 'letterboxd', 'serializd'],
        'log',
      ),
    ).toEqual(['trakt', 'anilist', 'letterboxd']);
  });
});

// Plan 0022: Letterboxd's diary write needs the native sign-in WebView
// session, so its write is unsupported on web (registry
// unsupportedWritePlatforms) — routing splits it into a manual target there,
// not out of the target list entirely.
describe("splitWriteTargets('log')", () => {
  it('routes Letterboxd to manual on web, Trakt stays writable', () => {
    expect(
      splitWriteTargets(
        { type: 'MOVIE', ...ids({ trakt: 1 }) },
        ['trakt', 'letterboxd'],
        'web',
        'log',
      ),
    ).toEqual({ writable: ['trakt'], manual: ['letterboxd'] });
  });

  it('both are writable on ios (no unsupportedWritePlatforms match)', () => {
    expect(
      splitWriteTargets(
        { type: 'MOVIE', ...ids({ trakt: 1 }) },
        ['trakt', 'letterboxd'],
        'ios',
        'log',
      ),
    ).toEqual({ writable: ['trakt', 'letterboxd'], manual: [] });
  });
});

// Plan 0031 R5/R6/R7/KTD-1: watchlist targets come from `watchlistWrite`, never
// from `canWrite`. All four providers declare 'write' for the add — Trakt and
// AniList from the start, Letterboxd since plan 0033 (U6's capture), Serializd
// since U10's probe discharged KTD-10
// (docs/solutions/serializd-watchlist-clears-watched.md). Serializd's *remove*
// stays 'manual' (gated on its read leg, R32/R35) — so it is a manual row
// there, never absent. Letterboxd's web ban is platform-level
// (`unsupportedWritePlatforms`), not a declaration.
describe("splitWriteTargets('watchlist')", () => {
  it('a movie with all four connected: Trakt + Letterboxd writable (ios)', () => {
    expect(
      splitWriteTargets({ type: 'MOVIE', ...ids({ trakt: 1 }) }, ALL4, 'ios', 'watchlist'),
    ).toEqual({ writable: ['trakt', 'letterboxd'], manual: [] });
  });

  it('the same movie on web: Letterboxd manual per the platform ban', () => {
    expect(
      splitWriteTargets({ type: 'MOVIE', ...ids({ trakt: 1 }) }, ALL4, 'web', 'watchlist'),
    ).toEqual({ writable: ['trakt'], manual: ['letterboxd'] });
  });

  it('a mapped anime film: all three movie targets writable, Serializd absent (TV-only)', () => {
    expect(
      splitWriteTargets(
        { type: 'ANIME', isFilm: true, ...ids({ anilist: 1, tmdb: 2 }) },
        ALL4,
        'ios',
        'watchlist',
      ),
    ).toEqual({ writable: ['trakt', 'anilist', 'letterboxd'], manual: [] });
  });

  it("'none' is the only way out of both buckets", () => {
    const serializd = PROVIDERS.serializd;
    const original = serializd.watchlistWrite;
    serializd.watchlistWrite = 'none';
    try {
      expect(
        splitWriteTargets({ type: 'TV', ...ids({ trakt: 1 }) }, ALL4, 'ios', 'watchlist'),
      ).toEqual({ writable: ['trakt'], manual: [] });
      // …and the log verb is untouched by the watchlist declaration.
      expect(
        splitWriteTargets({ type: 'TV', ...ids({ trakt: 1 }) }, ALL4, 'ios', 'log'),
      ).toEqual({ writable: ['trakt', 'serializd'], manual: [] });
    } finally {
      serializd.watchlistWrite = original;
    }
  });
});

// Plan 0031 R33/KTD-15: remove is a second verb on the same axis, read from its
// own field — deriving it from `watchlistWrite` is the symmetry assumption the
// registry's docblock forbids.
describe("splitWriteTargets('watchlist-remove')", () => {
  it('resolves from watchlistRemove independently of watchlistWrite', () => {
    const letterboxd = PROVIDERS.letterboxd;
    const original = letterboxd.watchlistRemove;
    // Degrade one verb only: the remove going manual must not drag the add
    // with it — symmetry is the assumption the registry's docblock forbids.
    letterboxd.watchlistRemove = 'manual';
    try {
      const item = { type: 'MOVIE' as const, ...ids({ trakt: 1 }) };
      expect(splitWriteTargets(item, ALL4, 'ios', 'watchlist-remove')).toEqual({
        writable: ['trakt'],
        manual: ['letterboxd'],
      });
      expect(splitWriteTargets(item, ALL4, 'ios', 'watchlist')).toEqual({
        writable: ['trakt', 'letterboxd'],
        manual: [],
      });
    } finally {
      letterboxd.watchlistRemove = original;
    }
  });
});

// The load-bearing invariant behind the three-state declaration: an applicable
// provider is always in exactly one bucket. A provider in neither is the silent
// drop AGENTS.md's no-dead-end rule forbids.
describe('every applicable provider lands in exactly one bucket', () => {
  const fixtures: { name: string; item: Parameters<typeof splitWriteTargets>[0]; types: MediaType[] }[] =
    [
      { name: 'movie', item: { type: 'MOVIE', ...ids({ trakt: 1 }) }, types: ['MOVIE'] },
      { name: 'tv', item: { type: 'TV', ...ids({ trakt: 1 }) }, types: ['TV'] },
      { name: 'manga', item: { type: 'MANGA', ...ids({ anilist: 1 }) }, types: ['MANGA'] },
      {
        name: 'unmapped anime series',
        item: { type: 'ANIME', ...ids({ anilist: 1 }) },
        types: ['ANIME'],
      },
      {
        name: 'mapped anime series',
        item: { type: 'ANIME', ...ids({ anilist: 1, tvdb: 2 }) },
        types: ['ANIME', 'TV'],
      },
      {
        name: 'mapped anime film',
        item: { type: 'ANIME', isFilm: true, ...ids({ anilist: 1, tmdb: 2 }) },
        types: ['ANIME', 'MOVIE'],
      },
      {
        name: 'movie reverse-mapped to AniList',
        item: { type: 'MOVIE', ...ids({ trakt: 1, anilist: 2 }) },
        types: ['MOVIE', 'ANIME'],
      },
    ];

  const capabilities: WriteCapability[] = ['log', 'watchlist', 'watchlist-remove'];

  for (const { name, item, types } of fixtures) {
    for (const capability of capabilities) {
      // Platform only moves a target between buckets, never out of both.
      it(`${name} / ${capability}`, () => {
        const { writable, manual } = splitWriteTargets(item, ALL5, 'web', capability);
        const applicable = ALL5.filter((id) =>
          types.some((type) => PROVIDERS[id].mediaTypes.includes(type)),
        );

        // No provider whose mediaTypes apply is missing from the report…
        expect([...writable, ...manual].toSorted()).toEqual(applicable.toSorted());
        // …and none is in both.
        expect(writable.filter((id) => manual.includes(id))).toEqual([]);
      });
    }
  }
});

// Plan 0034 U6/U7: the write leg landed in U6 (`canWrite: true`,
// `watchlistWrite: 'write'`) and the read leg in U7 (`canRead: true`) — the
// only capability still gated is the watchlist *remove* (U4's live-probe gate
// on `/sync/history/remove`'s whole-library semantics). The full fan-out
// expectations now hold for both writes and feed aggregation.
describe('Simkl write + read fan-out (plan 0034 U6/U7)', () => {
  it('TV logs fan out to Trakt + Serializd + Simkl', () => {
    expect(providersForWrite({ type: 'TV', ...ids({ trakt: 1 }) }, ALL5, 'log')).toEqual([
      'trakt',
      'serializd',
      'simkl',
    ]);
  });

  it('movie logs fan out to Trakt + Letterboxd + Simkl', () => {
    expect(providersForWrite({ type: 'MOVIE', ...ids({ trakt: 1 }) }, ALL5, 'log')).toEqual([
      'trakt',
      'letterboxd',
      'simkl',
    ]);
  });

  it('an unmapped anime series reaches AniList + Simkl (direct ANIME match, no TV-side ids)', () => {
    expect(providersForWrite({ type: 'ANIME', ...ids({ anilist: 1 }) }, ALL5, 'log')).toEqual([
      'anilist',
      'simkl',
    ]);
  });

  it('a mapped anime series adds the TV-side targets, exactly as the existing anime tests do', () => {
    expect(
      providersForWrite({ type: 'ANIME', ...ids({ anilist: 1, tmdb: 2 }) }, ALL5, 'log'),
    ).toEqual(['trakt', 'anilist', 'serializd', 'simkl']);
  });

  it('an anime film fans out to every movie target + Simkl, never Serializd', () => {
    expect(
      providersForWrite(
        { type: 'ANIME', isFilm: true, ...ids({ anilist: 1, tmdb: 2 }) },
        ALL5,
        'log',
      ),
    ).toEqual(['trakt', 'anilist', 'letterboxd', 'simkl']);
  });

  it('MANGA never routes to Simkl (mediaTypes axis, independent of the flip)', () => {
    expect(providersForWrite({ type: 'MANGA', ...ids({ anilist: 1 }) }, ALL5, 'log')).toEqual([
      'anilist',
    ]);
  });

  it('joins feed aggregation through canRead, and drops out without it', () => {
    const simkl = PROVIDERS.simkl;
    const original = simkl.canRead;
    simkl.canRead = false;
    try {
      expect(providersForFeed(ALL5)).toEqual(['trakt', 'anilist', 'letterboxd', 'serializd']);
    } finally {
      simkl.canRead = original;
    }
  });

  it('both watchlist verbs are real write targets (remove flipped in plan 0036)', () => {
    expect(
      splitWriteTargets({ type: 'TV', ...ids({ trakt: 1 }) }, ALL5, 'ios', 'watchlist'),
    ).toEqual({ writable: ['trakt', 'serializd', 'simkl'], manual: [] });
    // Serializd stays manual on the remove — no watchlist read leg (R32) — so
    // the two verbs still split differently.
    expect(
      splitWriteTargets({ type: 'TV', ...ids({ trakt: 1 }) }, ALL5, 'ios', 'watchlist-remove'),
    ).toEqual({ writable: ['trakt', 'simkl'], manual: ['serializd'] });
  });

  it("reverting canWrite is the standing rollback — the gated state comes straight back", () => {
    const simkl = PROVIDERS.simkl;
    const original = simkl.canWrite;
    simkl.canWrite = false;
    try {
      expect(providersForWrite({ type: 'TV', ...ids({ trakt: 1 }) }, ALL5, 'log')).toEqual([
        'trakt',
        'serializd',
      ]);
    } finally {
      simkl.canWrite = original;
    }
  });
});

// Plan 0022 U3 scenario 5: useLogMedia's own defensive re-check must exclude a
// manual-only provider even if a caller forces it via variables.providers —
// this is the second (and last) line of defense against a banned write.
describe('resolveWriteTargets', () => {
  it('excludes a manual-only provider even when forced via onlyProviders (web)', () => {
    expect(
      resolveWriteTargets(
        { type: 'MOVIE', ...ids({ trakt: 1, letterboxd: 'heat' }) },
        ['trakt', 'letterboxd'],
        { capability: 'log', onlyProviders: ['letterboxd'], platform: 'web' },
      ),
    ).toEqual([]);
  });

  it('keeps the manual-only provider on ios (write is supported there)', () => {
    expect(
      resolveWriteTargets(
        { type: 'MOVIE', ...ids({ trakt: 1, letterboxd: 'heat' }) },
        ['trakt', 'letterboxd'],
        { capability: 'log', onlyProviders: ['letterboxd'], platform: 'ios' },
      ),
    ).toEqual(['letterboxd']);
  });

  it('drops AniList for a non-season-1 canonical episode batch', () => {
    expect(
      resolveWriteTargets(
        { type: 'TV', ...ids({ trakt: 1, anilist: 2 }) },
        ['trakt', 'anilist'],
        { capability: 'log', nonSeasonOneEpisodes: true, platform: 'ios' },
      ),
    ).toEqual(['trakt']);
  });

  // Plan 0027 R6/KTD2: an AniList-origin log reaches routing already
  // translated, so `useLogMedia` leaves the flag false and AniList survives
  // even when the batch maps to canonical season 2. Routing stays pure — it
  // never learns which domain the caller started in.
  it('keeps AniList when the caller does not raise the canonical-season flag', () => {
    expect(
      resolveWriteTargets(
        { type: 'ANIME', ...ids({ trakt: 1, tvdb: 9, anilist: 2 }) },
        ['trakt', 'anilist'],
        { capability: 'log', platform: 'ios' },
      ),
    ).toEqual(['trakt', 'anilist']);
  });

  // A declared-manual provider has no adapter behind it, so it must never
  // reach the fan-out on any platform — including native, where the platform
  // filter alone would let it through. Serializd's *remove* is the standing
  // manual declaration since the add flipped to 'write' with U10's probe.
  it('excludes a declared-manual watchlist-remove target on native, forced or not', () => {
    expect(
      resolveWriteTargets({ type: 'TV', ...ids({ trakt: 1 }) }, ALL4, {
        capability: 'watchlist-remove',
        platform: 'ios',
      }),
    ).toEqual(['trakt']);
    expect(
      resolveWriteTargets({ type: 'TV', ...ids({ trakt: 1 }) }, ALL4, {
        capability: 'watchlist-remove',
        onlyProviders: ['serializd'],
        platform: 'ios',
      }),
    ).toEqual([]);
  });
});
