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

/** Routing inputs are enriched items — externalIds drive cross-provider matches. */
const ids = (externalIds: Record<string, number | string> = {}) => ({ externalIds });

// Letterboxd writes movies as diary entries (registry canWrite: true, plan
// 0012 session-capture path), so it is a log target for movies and anime films
// alongside Trakt.
describe("providersForWrite('log')", () => {
  it('routes movies to Trakt + Letterboxd', () => {
    expect(providersForWrite({ type: 'MOVIE', ...ids({ trakt: 1 }) }, ALL, 'log')).toEqual([
      'trakt',
      'letterboxd',
    ]);
  });

  it('routes TV to Trakt only', () => {
    expect(providersForWrite({ type: 'TV', ...ids({ trakt: 1 }) }, ALL, 'log')).toEqual([
      'trakt',
    ]);
  });

  it('routes manga to AniList only', () => {
    expect(providersForWrite({ type: 'MANGA', ...ids({ anilist: 1 }) }, ALL, 'log')).toEqual([
      'anilist',
    ]);
  });

  it('routes an unmapped anime series to AniList only', () => {
    expect(providersForWrite({ type: 'ANIME', ...ids({ anilist: 1 }) }, ALL, 'log')).toEqual([
      'anilist',
    ]);
  });

  it('routes a mapped anime series to Trakt too (it is a TV show there, plan 0011)', () => {
    expect(
      providersForWrite({ type: 'ANIME', ...ids({ anilist: 1, tvdb: 2 }) }, ALL, 'log'),
    ).toEqual(['trakt', 'anilist']);
  });

  it('routes a mapped anime film to all three (it is a MOVIE to Trakt + Letterboxd)', () => {
    expect(
      providersForWrite(
        { type: 'ANIME', isFilm: true, ...ids({ anilist: 1, tmdb: 2 }) },
        ALL,
        'log',
      ),
    ).toEqual(['trakt', 'anilist', 'letterboxd']);
  });

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

  it('a movie reverse-mapped to AniList also routes there', () => {
    expect(
      providersForWrite({ type: 'MOVIE', ...ids({ trakt: 1, anilist: 2 }) }, ALL, 'log'),
    ).toEqual(['trakt', 'anilist', 'letterboxd']);
  });

  it('routes an anime film to a Letterboxd-only connection (it is a MOVIE there)', () => {
    expect(
      providersForWrite(
        { type: 'ANIME', isFilm: true, ...ids({ anilist: 1, tmdb: 2 }) },
        ['letterboxd'],
        'log',
      ),
    ).toEqual(['letterboxd']);
  });

  it('returns empty when no connected provider applies (TV, AniList-only)', () => {
    expect(providersForWrite({ type: 'TV', ...ids({ trakt: 1 }) }, ['anilist'], 'log')).toEqual(
      [],
    );
  });

  it('returns empty when nothing is connected', () => {
    expect(providersForWrite({ type: 'MOVIE', ...ids({ trakt: 1 }) }, [], 'log')).toEqual([]);
  });

  it('a movie with isFilm set routes the same as a plain movie', () => {
    expect(
      providersForWrite({ type: 'MOVIE', isFilm: true, ...ids({ trakt: 1 }) }, ALL, 'log'),
    ).toEqual(['trakt', 'letterboxd']);
  });

  // Serializd (plan 0017): TV-only, symmetric write. Routing derives inclusion
  // from the registry's mediaTypes — the no-tmdb skip lives in the writes layer,
  // never here, so routing includes Serializd for any TV/mapped-anime item.
  it('routes TV to Trakt + Serializd when both connected', () => {
    expect(
      providersForWrite({ type: 'TV', ...ids({ trakt: 1 }) }, ['trakt', 'serializd'], 'log'),
    ).toEqual(['trakt', 'serializd']);
  });

  it('routes a mapped anime series (a TV show there) to AniList + Serializd', () => {
    expect(
      providersForWrite(
        { type: 'ANIME', ...ids({ anilist: 1, tmdb: 2 }) },
        ['anilist', 'serializd'],
        'log',
      ),
    ).toEqual(['anilist', 'serializd']);
  });

  it('excludes Serializd for an unmapped anime series (no movie/TV type)', () => {
    expect(
      providersForWrite(
        { type: 'ANIME', ...ids({ anilist: 1 }) },
        ['anilist', 'serializd'],
        'log',
      ),
    ).toEqual(['anilist']);
  });

  it('excludes Serializd for a MOVIE (TV-only provider)', () => {
    expect(
      providersForWrite({ type: 'MOVIE', ...ids({ trakt: 1 }) }, ['trakt', 'serializd'], 'log'),
    ).toEqual(['trakt']);
  });

  it('excludes Serializd for a mapped anime film (a MOVIE there, not TV)', () => {
    expect(
      providersForWrite(
        { type: 'ANIME', isFilm: true, ...ids({ anilist: 1, tmdb: 2 }) },
        ['anilist', 'serializd'],
        'log',
      ),
    ).toEqual(['anilist']);
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

describe('providersForFeed', () => {
  it('returns connected read-capable providers in connection order', () => {
    // All three currently declare canRead — this pins the filtering contract
    // so a future read-only/degraded provider (e.g. Letterboxd CSV fallback)
    // changes the registry, not the routing logic.
    expect(providersForFeed(['anilist', 'trakt'])).toEqual(['anilist', 'trakt']);
    expect(providersForFeed([])).toEqual([]);
  });

  it('includes Serializd when connected (canRead)', () => {
    expect(providersForFeed(['trakt', 'serializd'])).toEqual(['trakt', 'serializd']);
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

  it('a TV item never includes Letterboxd in either bucket (not applicable)', () => {
    expect(
      splitWriteTargets(
        { type: 'TV', ...ids({ trakt: 1 }) },
        ['trakt', 'letterboxd'],
        'web',
        'log',
      ),
    ).toEqual({ writable: ['trakt'], manual: [] });
  });

  it('a provider without the flag is unaffected on every platform', () => {
    for (const platform of ['web', 'ios', 'android']) {
      expect(
        splitWriteTargets({ type: 'TV', ...ids({ trakt: 1 }) }, ['trakt'], platform, 'log'),
      ).toEqual({ writable: ['trakt'], manual: [] });
    }
  });
});

// Plan 0031 R5/R6/R7/KTD-1: watchlist targets come from `watchlistWrite`, never
// from `canWrite`. In this PR Trakt and AniList declare 'write'; Letterboxd
// (endpoint unverified, U6's spike) and Serializd (Worker allowlist + season
// guard, U9) declare 'manual' — so they are manual rows, never absent.
describe("splitWriteTargets('watchlist')", () => {
  for (const platform of ['web', 'ios']) {
    it(`a movie with all four connected: Trakt writable, Letterboxd manual (${platform})`, () => {
      expect(
        splitWriteTargets({ type: 'MOVIE', ...ids({ trakt: 1 }) }, ALL4, platform, 'watchlist'),
      ).toEqual({ writable: ['trakt'], manual: ['letterboxd'] });
    });
  }

  it('a TV show: Trakt writable, Serializd manual per its declaration — never dropped', () => {
    expect(
      splitWriteTargets({ type: 'TV', ...ids({ trakt: 1 }) }, ALL4, 'ios', 'watchlist'),
    ).toEqual({ writable: ['trakt'], manual: ['serializd'] });
  });

  it('a mapped anime film: Trakt + AniList writable, Letterboxd manual, Serializd absent (TV-only)', () => {
    expect(
      splitWriteTargets(
        { type: 'ANIME', isFilm: true, ...ids({ anilist: 1, tmdb: 2 }) },
        ALL4,
        'ios',
        'watchlist',
      ),
    ).toEqual({ writable: ['trakt', 'anilist'], manual: ['letterboxd'] });
  });

  it('mirrors the log routing for that same anime film (one shared effectiveTypes)', () => {
    const item = { type: 'ANIME' as const, isFilm: true, ...ids({ anilist: 1, tmdb: 2 }) };
    expect(providersForWrite(item, ALL4, 'watchlist')).toEqual(
      providersForWrite(item, ALL4, 'log'),
    );
  });

  it('MANGA: AniList only, no manual rows', () => {
    expect(
      splitWriteTargets({ type: 'MANGA', ...ids({ anilist: 1 }) }, ALL4, 'web', 'watchlist'),
    ).toEqual({ writable: ['anilist'], manual: [] });
  });

  it('a declared-write provider still goes manual where the platform bans the write', () => {
    // Simulates U6's spike succeeding: the endpoint exists, but Letterboxd's
    // fingerprint wall still bans every write on web, so web stays manual.
    const letterboxd = PROVIDERS.letterboxd;
    const original = letterboxd.watchlistWrite;
    letterboxd.watchlistWrite = 'write';
    try {
      const item = { type: 'MOVIE' as const, ...ids({ trakt: 1 }) };
      expect(splitWriteTargets(item, ALL4, 'ios', 'watchlist')).toEqual({
        writable: ['trakt', 'letterboxd'],
        manual: [],
      });
      expect(splitWriteTargets(item, ALL4, 'web', 'watchlist')).toEqual({
        writable: ['trakt'],
        manual: ['letterboxd'],
      });
    } finally {
      letterboxd.watchlistWrite = original;
    }
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
    // R37's live counterexample: the remove is safe from the watchlist surface
    // while the add stays unverified.
    letterboxd.watchlistRemove = 'write';
    try {
      const item = { type: 'MOVIE' as const, ...ids({ trakt: 1 }) };
      expect(splitWriteTargets(item, ALL4, 'ios', 'watchlist-remove')).toEqual({
        writable: ['trakt', 'letterboxd'],
        manual: [],
      });
      expect(splitWriteTargets(item, ALL4, 'ios', 'watchlist')).toEqual({
        writable: ['trakt'],
        manual: ['letterboxd'],
      });
    } finally {
      letterboxd.watchlistRemove = original;
    }
  });

  it('matches the add verb while both declarations agree (this PR)', () => {
    const item = { type: 'TV' as const, ...ids({ trakt: 1 }) };
    expect(splitWriteTargets(item, ALL4, 'ios', 'watchlist-remove')).toEqual({
      writable: ['trakt'],
      manual: ['serializd'],
    });
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
      for (const platform of ['web', 'ios', 'android']) {
        it(`${name} / ${capability} / ${platform}`, () => {
          const { writable, manual } = splitWriteTargets(item, ALL4, platform, capability);
          const applicable = ALL4.filter((id) =>
            types.some((type) => PROVIDERS[id].mediaTypes.includes(type)),
          );

          // No provider whose mediaTypes apply is missing from the report…
          expect([...writable, ...manual].toSorted()).toEqual(applicable.toSorted());
          // …and none is in both.
          expect(writable.filter((id) => manual.includes(id))).toEqual([]);
        });
      }
    }
  }
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

  it('applies routing, opt-out, and platform filters together', () => {
    expect(
      resolveWriteTargets(
        { type: 'MOVIE', ...ids({ trakt: 1, letterboxd: 'heat' }) },
        ['trakt', 'letterboxd'],
        { capability: 'log', platform: 'web' },
      ),
    ).toEqual(['trakt']);
  });

  // A declared-manual provider has no adapter behind it, so it must never
  // reach the fan-out on any platform — including native, where the platform
  // filter alone would let it through.
  it('excludes a declared-manual watchlist target on native, forced or not', () => {
    expect(
      resolveWriteTargets({ type: 'TV', ...ids({ trakt: 1 }) }, ALL4, {
        capability: 'watchlist',
        platform: 'ios',
      }),
    ).toEqual(['trakt']);
    expect(
      resolveWriteTargets({ type: 'TV', ...ids({ trakt: 1 }) }, ALL4, {
        capability: 'watchlist',
        onlyProviders: ['serializd'],
        platform: 'ios',
      }),
    ).toEqual([]);
  });
});
