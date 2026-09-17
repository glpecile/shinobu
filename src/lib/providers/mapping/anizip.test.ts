import { describe, expect, test } from 'bun:test';

import type { HttpFetch } from '@/lib/http/types';
import { fetchAniZipEpisodeMap, fetchAniZipIds } from './anizip';

/**
 * Fixtures are trimmed captures of real `api.ani.zip/mappings` responses
 * (probed 2026-07-26/27), not hand-written interfaces — the discipline
 * docs/solutions/trakt-progress-episodes-have-no-season-field.md exists for.
 * Only `overview`/`summary`/`image`/`rating` and the non-English titles were
 * dropped; every field the decoder reads is verbatim.
 */

/** Dan Da Dan Season 2 (anilist 185660) — a sequel entry: entry 1 → S02E01. */
const DANDADAN_S2 = {
  mappings: {
    animeplanet_id: 'dandadan-2nd-season',
    kitsu_id: 49425,
    mal_id: 60543,
    type: 'TV',
    anilist_id: 185660,
    anisearch_id: 19952,
    anidb_id: 19060,
    notifymoe_id: null,
    livechart_id: 12979,
    thetvdb_id: 432832,
    imdb_id: 'tt30217403',
    themoviedb_id: '240411',
  },
  episodes: {
    '1': {
      tvdbShowId: 432832,
      tvdbId: 10858858,
      seasonNumber: 2,
      episodeNumber: 1,
      absoluteEpisodeNumber: 13,
      title: { en: 'Like, This Is the Legend of the Giant Snake' },
      airDate: '2025-07-04',
      airDateUtc: '2025-07-03T15:30:00Z',
      runtime: 24,
      episode: '1',
      anidbEid: 297760,
      length: 25,
      airdate: '2025-07-04',
    },
    '2': {
      tvdbShowId: 432832,
      tvdbId: 11217472,
      seasonNumber: 2,
      episodeNumber: 2,
      absoluteEpisodeNumber: 14,
      title: { en: 'The Evil Eye' },
      airDate: '2025-07-11',
      airDateUtc: '2025-07-10T15:30:00Z',
      runtime: 24,
      episode: '2',
      anidbEid: 297761,
      length: 25,
      airdate: '2025-07-11',
    },
    '12': {
      tvdbShowId: 432832,
      tvdbId: 11217482,
      seasonNumber: 2,
      episodeNumber: 12,
      absoluteEpisodeNumber: 24,
      title: { en: 'Clash! Space Kaiju vs. Giant Robot!' },
      airDate: '2025-09-19',
      airDateUtc: '2025-09-18T15:30:00Z',
      runtime: 24,
      finaleType: 'season',
      episode: '12',
      anidbEid: 299687,
      length: 25,
      airdate: '2025-09-19',
    },
    // A specials key, and no season/episode numbers on it at all.
    S1: {
      episode: 'S1',
      anidbEid: 298141,
      length: 25,
      airdate: '2025-06-27',
      title: { en: 'Pre-Broadcast Special' },
    },
  },
};

function jsonFetch(body: unknown, ok = true): HttpFetch {
  return async () =>
    ({
      ok,
      status: ok ? 200 : 500,
      headers: new Headers(),
      json: async () => body,
    }) as Awaited<ReturnType<HttpFetch>>;
}

const LOOKUP = { anilistId: 185660 } as const;

const malformedFetch: HttpFetch = async () =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async (): Promise<unknown> => {
      throw new SyntaxError('Unexpected token <');
    },
  }) as Awaited<ReturnType<HttpFetch>>;

const offlineFetch: HttpFetch = async () => {
  throw new Error('Network request failed');
};

describe('fetchAniZipEpisodeMap', () => {
  test('a sequel entry maps entry-relative episodes into its canonical season', async () => {
    const map = await fetchAniZipEpisodeMap(jsonFetch(DANDADAN_S2), LOOKUP);

    // `absolute` rides along because TVDB's seasons are frequently not the
    // trackers' — see season-layout.ts.
    expect(map?.get(1)).toEqual({ season: 2, number: 1, absolute: 13 });
    expect(map?.get(12)).toEqual({ season: 2, number: 12, absolute: 24 });
  });

  test('specials keys and season-less entries drop out, numbered episodes survive', async () => {
    const map = await fetchAniZipEpisodeMap(
      jsonFetch({
        episodes: {
          ...DANDADAN_S2.episodes,
          // A numbered episode ani.zip has not placed in a season yet.
          '13': { episode: '13', airdate: '2025-09-26' },
        },
      }),
      LOOKUP,
    );

    expect([...(map ?? [])].map(([key]) => key).sort((a, b) => a - b)).toEqual([
      1, 2, 12,
    ]);
  });

  test('a document with no episodes block is a miss, not an empty map', async () => {
    expect(
      await fetchAniZipEpisodeMap(jsonFetch({ mappings: DANDADAN_S2.mappings }), LOOKUP),
    ).toBeNull();
  });

  test('non-200, malformed JSON, and network errors all degrade to null', async () => {
    expect(await fetchAniZipEpisodeMap(jsonFetch({}, false), LOOKUP)).toBeNull();
    expect(await fetchAniZipEpisodeMap(malformedFetch, LOOKUP)).toBeNull();
    expect(await fetchAniZipEpisodeMap(offlineFetch, LOOKUP)).toBeNull();
  });
});

describe('fetchAniZipIds (unchanged by the episode-map sibling)', () => {
  test('decodes the mappings block, TMDB string id included', async () => {
    expect(await fetchAniZipIds(jsonFetch(DANDADAN_S2), LOOKUP)).toEqual({
      anilist: 185660,
      tvdb: 432832,
      tmdb: 240411,
      imdb: 'tt30217403',
      type: 'TV',
    });
  });

  test('no mappings block → null', async () => {
    expect(
      await fetchAniZipIds(jsonFetch({ episodes: DANDADAN_S2.episodes }), LOOKUP),
    ).toBeNull();
  });
});
