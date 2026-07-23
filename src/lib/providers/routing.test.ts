import { describe, expect, it } from 'bun:test';

import type { ProviderId } from './types';
import {
  providersForFeed,
  providersForLog,
  resolveLogWriteTargets,
  splitLogTargets,
} from './routing';

const ALL: readonly ProviderId[] = ['trakt', 'anilist', 'letterboxd'];

/** Routing inputs are enriched items — externalIds drive cross-provider matches. */
const ids = (externalIds: Record<string, number | string> = {}) => ({ externalIds });

// Letterboxd writes movies as diary entries (registry canWrite: true, plan
// 0012 session-capture path), so it is a log target for movies and anime films
// alongside Trakt.
describe('providersForLog', () => {
  it('routes movies to Trakt + Letterboxd', () => {
    expect(providersForLog({ type: 'MOVIE', ...ids({ trakt: 1 }) }, ALL)).toEqual([
      'trakt',
      'letterboxd',
    ]);
  });

  it('routes TV to Trakt only', () => {
    expect(providersForLog({ type: 'TV', ...ids({ trakt: 1 }) }, ALL)).toEqual(['trakt']);
  });

  it('routes manga to AniList only', () => {
    expect(providersForLog({ type: 'MANGA', ...ids({ anilist: 1 }) }, ALL)).toEqual([
      'anilist',
    ]);
  });

  it('routes an unmapped anime series to AniList only', () => {
    expect(providersForLog({ type: 'ANIME', ...ids({ anilist: 1 }) }, ALL)).toEqual([
      'anilist',
    ]);
  });

  it('routes a mapped anime series to Trakt too (it is a TV show there, plan 0011)', () => {
    expect(
      providersForLog({ type: 'ANIME', ...ids({ anilist: 1, tvdb: 2 }) }, ALL),
    ).toEqual(['trakt', 'anilist']);
  });

  it('routes a mapped anime film to all three (it is a MOVIE to Trakt + Letterboxd)', () => {
    expect(
      providersForLog(
        { type: 'ANIME', isFilm: true, ...ids({ anilist: 1, tmdb: 2 }) },
        ALL,
      ),
    ).toEqual(['trakt', 'anilist', 'letterboxd']);
  });

  it('an unmapped anime film stays AniList-only (no movie-side id)', () => {
    expect(
      providersForLog({ type: 'ANIME', isFilm: true, ...ids({ anilist: 1 }) }, ALL),
    ).toEqual(['anilist']);
  });

  it('a TV show reverse-mapped to AniList also routes there', () => {
    expect(
      providersForLog({ type: 'TV', ...ids({ trakt: 1, anilist: 2 }) }, ALL),
    ).toEqual(['trakt', 'anilist']);
  });

  it('a movie reverse-mapped to AniList also routes there', () => {
    expect(
      providersForLog({ type: 'MOVIE', ...ids({ trakt: 1, anilist: 2 }) }, ALL),
    ).toEqual(['trakt', 'anilist', 'letterboxd']);
  });

  it('routes an anime film to a Letterboxd-only connection (it is a MOVIE there)', () => {
    expect(
      providersForLog(
        { type: 'ANIME', isFilm: true, ...ids({ anilist: 1, tmdb: 2 }) },
        ['letterboxd'],
      ),
    ).toEqual(['letterboxd']);
  });

  it('returns empty when no connected provider applies (TV, AniList-only)', () => {
    expect(providersForLog({ type: 'TV', ...ids({ trakt: 1 }) }, ['anilist'])).toEqual([]);
  });

  it('returns empty when nothing is connected', () => {
    expect(providersForLog({ type: 'MOVIE', ...ids({ trakt: 1 }) }, [])).toEqual([]);
  });

  it('a movie with isFilm set routes the same as a plain movie', () => {
    expect(
      providersForLog({ type: 'MOVIE', isFilm: true, ...ids({ trakt: 1 }) }, ALL),
    ).toEqual(['trakt', 'letterboxd']);
  });

  // Serializd (plan 0017): TV-only, symmetric write. Routing derives inclusion
  // from the registry's mediaTypes — the no-tmdb skip lives in the writes layer,
  // never here, so routing includes Serializd for any TV/mapped-anime item.
  it('routes TV to Trakt + Serializd when both connected', () => {
    expect(
      providersForLog({ type: 'TV', ...ids({ trakt: 1 }) }, ['trakt', 'serializd']),
    ).toEqual(['trakt', 'serializd']);
  });

  it('routes a mapped anime series (a TV show there) to AniList + Serializd', () => {
    expect(
      providersForLog({ type: 'ANIME', ...ids({ anilist: 1, tmdb: 2 }) }, [
        'anilist',
        'serializd',
      ]),
    ).toEqual(['anilist', 'serializd']);
  });

  it('excludes Serializd for an unmapped anime series (no movie/TV type)', () => {
    expect(
      providersForLog({ type: 'ANIME', ...ids({ anilist: 1 }) }, ['anilist', 'serializd']),
    ).toEqual(['anilist']);
  });

  it('excludes Serializd for a MOVIE (TV-only provider)', () => {
    expect(
      providersForLog({ type: 'MOVIE', ...ids({ trakt: 1 }) }, ['trakt', 'serializd']),
    ).toEqual(['trakt']);
  });

  it('excludes Serializd for a mapped anime film (a MOVIE there, not TV)', () => {
    expect(
      providersForLog(
        { type: 'ANIME', isFilm: true, ...ids({ anilist: 1, tmdb: 2 }) },
        ['anilist', 'serializd'],
      ),
    ).toEqual(['anilist']);
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
describe('splitLogTargets', () => {
  it('routes Letterboxd to manual on web, Trakt stays writable', () => {
    expect(
      splitLogTargets(
        { type: 'MOVIE', ...ids({ trakt: 1 }) },
        ['trakt', 'letterboxd'],
        'web',
      ),
    ).toEqual({ writable: ['trakt'], manual: ['letterboxd'] });
  });

  it('both are writable on ios (no unsupportedWritePlatforms match)', () => {
    expect(
      splitLogTargets(
        { type: 'MOVIE', ...ids({ trakt: 1 }) },
        ['trakt', 'letterboxd'],
        'ios',
      ),
    ).toEqual({ writable: ['trakt', 'letterboxd'], manual: [] });
  });

  it('a TV item never includes Letterboxd in either bucket (not applicable)', () => {
    expect(
      splitLogTargets(
        { type: 'TV', ...ids({ trakt: 1 }) },
        ['trakt', 'letterboxd'],
        'web',
      ),
    ).toEqual({ writable: ['trakt'], manual: [] });
  });

  it('a provider without the flag is unaffected on every platform', () => {
    for (const platform of ['web', 'ios', 'android']) {
      expect(
        splitLogTargets({ type: 'TV', ...ids({ trakt: 1 }) }, ['trakt'], platform),
      ).toEqual({ writable: ['trakt'], manual: [] });
    }
  });
});

// Plan 0022 U3 scenario 5: useLogMedia's own defensive re-check must exclude a
// manual-only provider even if a caller forces it via variables.providers —
// this is the second (and last) line of defense against a banned write.
describe('resolveLogWriteTargets', () => {
  it('excludes a manual-only provider even when forced via onlyProviders (web)', () => {
    expect(
      resolveLogWriteTargets(
        { type: 'MOVIE', ...ids({ trakt: 1, letterboxd: 'heat' }) },
        ['trakt', 'letterboxd'],
        { onlyProviders: ['letterboxd'], platform: 'web' },
      ),
    ).toEqual([]);
  });

  it('keeps the manual-only provider on ios (write is supported there)', () => {
    expect(
      resolveLogWriteTargets(
        { type: 'MOVIE', ...ids({ trakt: 1, letterboxd: 'heat' }) },
        ['trakt', 'letterboxd'],
        { onlyProviders: ['letterboxd'], platform: 'ios' },
      ),
    ).toEqual(['letterboxd']);
  });

  it('drops AniList for a non-season-1 episode batch', () => {
    expect(
      resolveLogWriteTargets(
        { type: 'TV', ...ids({ trakt: 1, anilist: 2 }) },
        ['trakt', 'anilist'],
        { nonSeasonOneEpisodes: true, platform: 'ios' },
      ),
    ).toEqual(['trakt']);
  });

  it('applies routing, opt-out, and platform filters together', () => {
    expect(
      resolveLogWriteTargets(
        { type: 'MOVIE', ...ids({ trakt: 1, letterboxd: 'heat' }) },
        ['trakt', 'letterboxd'],
        { platform: 'web' },
      ),
    ).toEqual(['trakt']);
  });
});
