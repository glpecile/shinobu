import type { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { ProviderId } from '@/lib/providers/types';
import type { AniZipIds } from '@/lib/providers/mapping/anizip';
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
let anilistTitleId: number | null = null;
let anizipBridge: AniZipIds | null = null;
let tmdbByTvdb: number | null = null;
let simklIds: NormalizedMediaItem['externalIds'] | null = null;
let tmdbAnimeMatch: { tmdbId: number; isFilm: boolean } | null = null;

mock.module('@/state/queries/mapping', () => ({
  cachedAniZipIds: (_client: unknown, lookup: unknown) => {
    calls.push(`anizip:${JSON.stringify(lookup)}`);
    return Promise.resolve(
      anizipBridge ?? (anizipAnilistId == null ? null : { anilist: anizipAnilistId }),
    );
  },
  cachedTmdbTvIdByTvdb: () => Promise.resolve(tmdbByTvdb),
  cachedSimklAnimeIds: () => Promise.resolve(simklIds),
  cachedTmdbAnimeMatch: () => Promise.resolve(tmdbAnimeMatch),
  cachedAniListFilmId: (_client: unknown, params: { title: string; year?: number }) => {
    calls.push(`anilist-film:${params.title}:${params.year ?? 'any'}`);
    return Promise.resolve(anilistFilmId);
  },
  cachedAniListIdByTitle: (_client: unknown, item: NormalizedMediaItem) => {
    calls.push(`anilist-title:${item.title}`);
    return Promise.resolve(anilistTitleId);
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

let letterboxdFilm: Partial<NormalizedMediaItem> | null = null;

mock.module('@/state/queries/letterboxd', () => ({
  cachedLetterboxdFilm: () => {
    calls.push('letterboxd-film');
    return Promise.resolve(letterboxdFilm);
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
    anilistTitleId = null;
  });

  test('adopts the AniList id when ani.zip misses and the search matches', async () => {
    anilistFilmId = 5678;

    const enriched = await enrichExternalIds(client, chao(), ALL);

    expect(enriched.externalIds.anilist).toBe(5678);
    expect(calls).toContain('anizip:{"tmdbId":1234}');
    expect(calls).toContain('anilist-film:ChaO:2025');
  });

  // TMDB movie 1429 shares its number with Attack on Titan's TV id.
  test('ignores an ani.zip record whose TMDB id is a TV id', async () => {
    anizipBridge = { anilist: 16498, tvdb: 267440, tmdb: 1429 };

    const enriched = await enrichExternalIds(client, chao({ externalIds: { trakt: 1, tmdb: 1429 } }), ALL);
    anizipBridge = null;

    expect(enriched.externalIds.anilist).toBeUndefined();
  });

  test('falls back to the title match for an anime AniList files as a series or ONA', async () => {
    anilistTitleId = 165933;

    const enriched = await enrichExternalIds(client, chao({ title: 'Undetectable Box' }), ALL);

    expect(enriched.externalIds.anilist).toBe(165933);
    expect(calls).toEqual(['anizip:{"tmdbId":1234}', 'anilist-film:Undetectable Box:2025', 'anilist-title:Undetectable Box']);
  });

  test('never runs the search when AniList is not connected', async () => {
    anilistFilmId = 5678;

    const enriched = await enrichExternalIds(client, chao(), [
      'trakt',
      'letterboxd',
    ]);

    expect(calls.some((call) => call.startsWith('anilist-'))).toBe(false);
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

  test('a Letterboxd TV relationship never searches for movie write identities', async () => {
    await enrichExternalIds(client, { ...idlessFilm(), tmdbTvVariant: 228880 }, [...ALL, 'simkl']);
    expect(calls).toEqual([]);
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

  // Cyberpunk: Edgerunners 2 (2026): ani.zip's themoviedb_id 326788 is a
  // TMDB 404, while its TVDB id finds the real show, 105248.
  test('a series anime takes its TMDB id from TVDB over ani.zip’s', async () => {
    anizipBridge = { tvdb: 384541, tmdb: 326788 };
    tmdbByTvdb = 105248;
    const enriched = await enrichExternalIds(
      client,
      chao({ id: 'anilist-195539', type: 'ANIME', isFilm: false, externalIds: { anilist: 195539 } }),
      ['serializd'],
    );
    anizipBridge = null;
    tmdbByTvdb = null;
    expect(enriched.externalIds.tmdb).toBe(105248);
  });
});

const slugOnly = (): NormalizedMediaItem => ({ ...idlessFilm(), externalIds: { letterboxd: 'hokum' } });

describe('enrichExternalIds — a Letterboxd film asks its own page first', () => {
  beforeEach(() => {
    calls.length = 0;
    letterboxdFilm = null;
  });

  test('takes the page’s TMDB id and skips the text search', async () => {
    letterboxdFilm = { externalIds: { letterboxd: 'hokum', tmdb: 4242 } };
    const enriched = await enrichExternalIds(client, slugOnly(), ['simkl', 'letterboxd']);
    expect(enriched.externalIds.tmdb).toBe(4242);
    expect(calls).not.toContain('trakt-search');
  });

  test('a page that is a TV series keeps the log on Letterboxd', async () => {
    letterboxdFilm = { externalIds: { letterboxd: 'hokum' }, tmdbTvVariant: 228880 };
    const enriched = await enrichExternalIds(client, slugOnly(), ['simkl', 'letterboxd']);
    expect(enriched.tmdbTvVariant).toBe(228880);
    expect(calls).toEqual(['letterboxd-film']);
  });

  test('falls back to the text search when the page read fails', async () => {
    await enrichExternalIds(client, slugOnly(), ['simkl', 'letterboxd']);
    expect(calls.slice(0, 2)).toEqual(['letterboxd-film', 'trakt-search']);
  });
});

// Demons' Crest (2026-11-06): a day after its premiere, ani.zip had no TVDB or
// TMDB id for AniList 203275, while Simkl linked TVDB 471128 and TMDB 328010.
describe('enrichExternalIds — a new release ani.zip has not mapped yet', () => {
  beforeEach(() => {
    simklIds = { simkl: 2953770, anilist: 203275, tvdb: 471128, tmdb: 328010 };
  });

  test('an AniList anime takes its TV ids from Simkl', async () => {
    const enriched = await enrichExternalIds(
      client,
      chao({ id: 'anilist-203275', type: 'ANIME', externalIds: { anilist: 203275 } }),
      ['serializd'],
    );
    expect(enriched.externalIds).toMatchObject({ tvdb: 471128, tmdb: 328010 });
  });
});

// The Last Blossom (2025): neither ani.zip nor Simkl link AniList 177686 to
// TMDB, so the film never reached Letterboxd.
describe('enrichExternalIds — an anime film no bridge maps', () => {
  beforeEach(() => {
    simklIds = null;
    tmdbAnimeMatch = { tmdbId: 1294972, isFilm: true };
  });

  test('takes the TMDB title match', async () => {
    const enriched = await enrichExternalIds(
      client,
      chao({ id: 'anilist-177686', type: 'ANIME', isFilm: true, externalIds: { anilist: 177686 } }),
      ['letterboxd'],
    );
    expect(enriched.externalIds.tmdb).toBe(1294972);
  });

  test('a series ignores it', async () => {
    const enriched = await enrichExternalIds(
      client,
      chao({ id: 'anilist-177686', type: 'ANIME', externalIds: { anilist: 177686 } }),
      ['serializd'],
    );
    expect(enriched.externalIds.tmdb).toBeUndefined();
  });
});

// Blood: The Last Vampire (AniList 405): ani.zip's 19849 is the TMDB *TV* id
// of the show the film is a special of. Voices of a Distant Star (AniList
// 256, an OVA): its 37910 is a TMDB *movie* id.
const film = () => chao({ id: 'anilist-405', type: 'ANIME', isFilm: true, externalIds: { anilist: 405 } });

const ova = (totalEpisodes: number) =>
  chao({ id: 'anilist-256', type: 'ANIME', isFilm: false, totalEpisodes, externalIds: { anilist: 256 } });

describe('enrichExternalIds — a bridge id of the other kind', () => {
  beforeEach(() => {
    simklIds = null;
    tmdbAnimeMatch = null;
    tmdbByTvdb = null;
  });

  test('a film tied to a TVDB show takes the title match, not the show’s id', async () => {
    anizipBridge = { anilist: 405, tvdb: 78960, tmdb: 19849 };
    tmdbAnimeMatch = { tmdbId: 919, isFilm: true };
    const enriched = await enrichExternalIds(client, film(), ['letterboxd']);
    anizipBridge = null;
    tmdbAnimeMatch = null;
    expect(enriched.externalIds).toMatchObject({ anilist: 405, tmdb: 919 });
    expect(enriched.externalIds.tvdb).toBeUndefined();
  });

  test('with no title match it takes no TMDB id', async () => {
    anizipBridge = { anilist: 405, tvdb: 78960, tmdb: 19849 };
    const enriched = await enrichExternalIds(client, film(), ['letterboxd']);
    anizipBridge = null;
    expect(enriched.externalIds.tmdb).toBeUndefined();
  });

  test('an OVA with no TVDB id never uses a movie id as a show id', async () => {
    anizipBridge = { anilist: 256, tmdb: 37910, imdb: 'tt0370754' };
    const enriched = await enrichExternalIds(
      client,
      chao({ id: 'anilist-256', type: 'ANIME', isFilm: false, externalIds: { anilist: 256 } }),
      ['trakt', 'serializd'],
    );
    anizipBridge = null;
    expect(enriched.externalIds).toEqual({ anilist: 256 });
  });

  test('a one-episode OVA bridged to a movie becomes a film', async () => {
    anizipBridge = { anilist: 256, tmdb: 37910, imdb: 'tt0370754' };
    const enriched = await enrichExternalIds(client, ova(1), ['letterboxd']);
    anizipBridge = null;
    expect(enriched.isFilm).toBe(true);
    expect(enriched.externalIds).toEqual({ anilist: 256, tmdb: 37910, imdb: 'tt0370754' });
  });

  test('an unmapped one-episode ONA takes a TMDB movie match, never a show match', async () => {
    tmdbAnimeMatch = { tmdbId: 901323, isFilm: true };
    const asFilm = await enrichExternalIds(client, ova(1), ['letterboxd']);
    tmdbAnimeMatch = { tmdbId: 5, isFilm: false };
    const asShow = await enrichExternalIds(client, ova(1), ['letterboxd']);
    tmdbAnimeMatch = null;
    expect(asFilm).toMatchObject({ isFilm: true, externalIds: { tmdb: 901323 } });
    expect(asShow.isFilm).toBe(false);
    expect(asShow.externalIds.tmdb).toBeUndefined();
  });

  test('a two-episode OVA bridged to a movie stays a series', async () => {
    anizipBridge = { anilist: 256, tmdb: 37910 };
    const enriched = await enrichExternalIds(client, ova(2), ['trakt']);
    anizipBridge = null;
    expect(enriched.isFilm).toBe(false);
    expect(enriched.externalIds).toEqual({ anilist: 256 });
  });
});
