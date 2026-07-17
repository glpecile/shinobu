import { describe, expect, it } from 'bun:test';

import type { ProviderId } from './types';
import { providersForFeed, providersForLog } from './routing';

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
});

describe('providersForFeed', () => {
  it('returns connected read-capable providers in connection order', () => {
    // All three currently declare canRead — this pins the filtering contract
    // so a future read-only/degraded provider (e.g. Letterboxd CSV fallback)
    // changes the registry, not the routing logic.
    expect(providersForFeed(['anilist', 'trakt'])).toEqual(['anilist', 'trakt']);
    expect(providersForFeed([])).toEqual([]);
  });
});
