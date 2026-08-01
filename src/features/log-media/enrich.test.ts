import type { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import { providersForWrite } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The seam is `state/queries/mapping` — every lookup `enrich.ts` performs goes
 * through it, and it owns the provider deps (MMKV tokens, the native fetch
 * client) that don't load under bun. Faking the module keeps this a test of
 * *which lookups run and what the ids become*, which is the whole contract.
 */
const calls: string[] = [];
let anizipAnilistId: number | null = null;
let anilistFilmId: number | null = null;

mock.module('@/state/queries/mapping', () => ({
  cachedAniZipIds: (_client: unknown, lookup: unknown) => {
    calls.push(`anizip:${JSON.stringify(lookup)}`);
    return Promise.resolve(
      anizipAnilistId == null ? null : { anilist: anizipAnilistId },
    );
  },
  cachedAniListFilmId: (_client: unknown, params: { title: string; year?: number }) => {
    calls.push(`anilist-film:${params.title}:${params.year ?? 'any'}`);
    return Promise.resolve(anilistFilmId);
  },
  cachedTraktLookup: () => {
    calls.push('trakt-lookup');
    return Promise.resolve(null);
  },
  cachedTraktTextSearch: () => {
    calls.push('trakt-search');
    return Promise.resolve(null);
  },
  // Same process-wide reason as `cachedAniZipEpisodeMap` below: unreachable
  // from `enrich.ts`, but Up Next's Letterboxd release resolve imports it.
  cachedTmdbMovieIdByTitle: () => {
    calls.push('tmdb-movie-search');
    return Promise.resolve(null);
  },
  // Never reached from `enrich.ts` (plan 0027 translates *after* enrichment) —
  // present because `mock.module` is process-wide, so the fake must expose
  // every named export any module loaded later imports.
  cachedAniZipEpisodeMap: () => {
    calls.push('anizip-episodes');
    return Promise.resolve(null);
  },
  cachedSeasonLayout: () => {
    calls.push('season-layout');
    return Promise.resolve(null);
  },
}));

const { enrichExternalIds } = await import('./enrich');

// ChaO (2025): a TMDB-first anime film. ani.zip's themoviedb_id index is
// TV-oriented and has no entry for it, so before plan 0024 U6 the log sheet
// offered Trakt + Letterboxd only.
function chao(
  overrides: Partial<NormalizedMediaItem> = {},
): NormalizedMediaItem {
  return {
    id: 'trakt-1',
    title: 'ChaO',
    coverImage: '',
    type: 'MOVIE',
    year: 2025,
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-25T00:00:00.000Z',
    externalIds: { trakt: 1, tmdb: 1234 },
    ...overrides,
  };
}

const ALL: readonly ProviderId[] = ['trakt', 'anilist', 'letterboxd', 'serializd'];
const client = {} as QueryClient;

describe('enrichExternalIds — anime film AniList fallback', () => {
  beforeEach(() => {
    calls.length = 0;
    anizipAnilistId = null;
    anilistFilmId = null;
  });

  test('adopts the AniList id when ani.zip misses and the search matches', async () => {
    anilistFilmId = 5678;

    const enriched = await enrichExternalIds(client, chao(), ALL);

    expect(enriched.externalIds.anilist).toBe(5678);
    expect(calls).toContain('anizip:{"tmdbId":1234}');
    expect(calls).toContain('anilist-film:ChaO:2025');
    // Serializd is TV-only, so a film never routes there even once it is
    // also an ANIME to the router.
    expect(providersForWrite(enriched, ALL, 'log')).toEqual([
      'trakt',
      'anilist',
      'letterboxd',
    ]);
  });

  test('adopts nothing when the search finds no confident match', async () => {
    anilistFilmId = null;

    const enriched = await enrichExternalIds(client, chao(), ALL);

    expect(enriched.externalIds.anilist).toBeUndefined();
    expect(providersForWrite(enriched, ALL, 'log')).toEqual(['trakt', 'letterboxd']);
  });

  test('never runs the search when AniList is not connected', async () => {
    anilistFilmId = 5678;

    const enriched = await enrichExternalIds(client, chao(), [
      'trakt',
      'letterboxd',
    ]);

    expect(calls.some((call) => call.startsWith('anilist-film:'))).toBe(false);
    expect(enriched.externalIds.anilist).toBeUndefined();
  });

  test('skips the search entirely when ani.zip already resolved the id', async () => {
    anizipAnilistId = 42;
    anilistFilmId = 5678;

    const enriched = await enrichExternalIds(client, chao(), ALL);

    expect(enriched.externalIds.anilist).toBe(42);
    expect(calls.some((call) => call.startsWith('anilist-film:'))).toBe(false);
  });

  test('skips the search for a yearless film — the year gate is the confidence', async () => {
    anilistFilmId = 5678;
    const yearless = chao();
    delete yearless.year;

    await enrichExternalIds(client, yearless, ALL);

    expect(calls.some((call) => call.startsWith('anilist-film:'))).toBe(false);
  });
});

// A Letterboxd watchlist film: slug + title + year, no cross-provider id.
const idlessFilm = (): NormalizedMediaItem => ({
  id: 'letterboxd-hokum',
  title: 'Hokum',
  coverImage: '',
  type: 'MOVIE',
  year: 2026,
  currentProgress: 0,
  progressUnit: 'episode',
  lastUpdated: '2026-07-25T00:00:00.000Z',
  externalIds: {},
});

/**
 * The gates that decide whether a lookup runs at all. Both were written when
 * Trakt was the only movie/TV tracker, and starved Simkl's fan-out leg after
 * the detachment: Simkl resolves a write by `tmdb`/`imdb` (movies & TV) and
 * would otherwise fail with "no Simkl-resolvable id".
 */
describe('enrichExternalIds — Simkl needs the same bridges Trakt does', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  test('a Simkl-only user resolves an id-less film by text search', async () => {
    await enrichExternalIds(client, idlessFilm(), ['simkl', 'letterboxd']);
    expect(calls).toContain('trakt-search');
  });

  test('no movie tracker connected still skips the search', async () => {
    await enrichExternalIds(client, idlessFilm(), ['letterboxd']);
    expect(calls).not.toContain('trakt-search');
  });

  test('a Simkl-only user bridges an AniList anime to tmdb/tvdb/imdb', async () => {
    await enrichExternalIds(
      client,
      chao({ id: 'anilist-9', type: 'ANIME', externalIds: { anilist: 9 } }),
      ['simkl', 'anilist'],
    );
    expect(calls.some((call) => call.startsWith('anizip:'))).toBe(true);
  });
});
