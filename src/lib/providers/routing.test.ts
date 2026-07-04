import { describe, expect, it } from 'bun:test';

import type { ProviderId } from './types';
import { providersForFeed, providersForLog } from './routing';

const ALL: readonly ProviderId[] = ['trakt', 'anilist', 'letterboxd'];

describe('providersForLog', () => {
  it('routes movies to Trakt + Letterboxd', () => {
    expect(providersForLog({ type: 'MOVIE' }, ALL)).toEqual(['trakt', 'letterboxd']);
  });

  it('routes TV to Trakt only', () => {
    expect(providersForLog({ type: 'TV' }, ALL)).toEqual(['trakt']);
  });

  it('routes manga to AniList only', () => {
    expect(providersForLog({ type: 'MANGA' }, ALL)).toEqual(['anilist']);
  });

  it('routes anime series to AniList only', () => {
    expect(providersForLog({ type: 'ANIME' }, ALL)).toEqual(['anilist']);
  });

  it('routes anime films to all three providers', () => {
    expect(providersForLog({ type: 'ANIME', isFilm: true }, ALL)).toEqual([
      'trakt',
      'anilist',
      'letterboxd',
    ]);
  });

  it('only fans out to connected providers (anime film, Letterboxd-only)', () => {
    expect(providersForLog({ type: 'ANIME', isFilm: true }, ['letterboxd'])).toEqual([
      'letterboxd',
    ]);
  });

  it('returns empty when no connected provider applies (TV, AniList-only)', () => {
    expect(providersForLog({ type: 'TV' }, ['anilist'])).toEqual([]);
  });

  it('returns empty when nothing is connected', () => {
    expect(providersForLog({ type: 'MOVIE' }, [])).toEqual([]);
  });

  it('a movie with isFilm set routes the same as a plain movie', () => {
    expect(providersForLog({ type: 'MOVIE', isFilm: true }, ALL)).toEqual([
      'trakt',
      'letterboxd',
    ]);
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
