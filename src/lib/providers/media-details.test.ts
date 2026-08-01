import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { TokenStore } from '@/lib/providers/token-store';
import {
  getMediaDetails,
  tmdbKindFor,
  type MediaDetailsDeps,
} from './media-details';

const tokens: TokenStore = { get: () => null, set: () => {}, clear: () => {} };

/** Routes each request by URL substring; unmatched URLs 404. */
function fakeFetch(routes: Array<[match: string, body: unknown, status?: number]>) {
  return (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    const hit = routes.find(([match]) => url.includes(match));
    if (hit == null) return Promise.resolve(new Response('{}', { status: 404 }));
    return Promise.resolve(
      new Response(JSON.stringify(hit[1]), {
        status: hit[2] ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
}

function deps(
  routes: Array<[string, unknown, number?]>,
  options: { tmdb?: boolean; trakt?: boolean } = {},
): MediaDetailsDeps {
  const fetch = fakeFetch(routes);
  return {
    tmdb: options.tmdb === false ? null : { fetch, token: 'test-token' },
    trakt:
      options.trakt === false
        ? null
        : { fetch, tokens, clientId: 'cid', clientSecret: 'secret' },
    anilist: { fetch, tokens },
  };
}

const TMDB_MOVIE = [
  '/movie/603',
  {
    id: 603,
    title: 'The Matrix',
    release_date: '1999-03-30',
    credits: {
      cast: [{ id: 6384, name: 'Keanu Reeves', character: 'Neo', order: 0 }],
    },
    production_companies: [{ id: 79, name: 'Village Roadshow Pictures' }],
  },
] satisfies [string, unknown];

const TRAKT_PEOPLE = [
  '/movies/1/people',
  { cast: [{ character: 'Neo', person: { name: 'Keanu Reeves', ids: { trakt: 9 } } }] },
] satisfies [string, unknown];

const TRAKT_STUDIOS = [
  '/movies/1/studios',
  [{ name: 'Village Roadshow Pictures', ids: { trakt: 4, tmdb: 79 } }],
] satisfies [string, unknown];

const ANILIST_CREDITS = [
  'graphql',
  {
    data: {
      Media: {
        characters: {
          edges: [
            {
              node: { name: { full: 'Maomao' } },
              voiceActors: [
                { id: 7, name: { full: 'Aoi Yuki' }, image: { large: 'https://img/aoi.jpg' } },
              ],
            },
          ],
        },
        staff: { edges: [] },
        studios: { nodes: [{ id: 5, name: 'TOHO animation STUDIO' }] },
      },
    },
  },
] satisfies [string, unknown];

describe('tmdbKindFor', () => {
  test('maps types with the isFilm edge case', () => {
    expect(tmdbKindFor('MOVIE')).toBe('movie');
    expect(tmdbKindFor('TV')).toBe('tv');
    expect(tmdbKindFor('ANIME')).toBe('tv');
    expect(tmdbKindFor('ANIME', true)).toBe('movie');
    expect(tmdbKindFor('MANGA')).toBeNull();
  });
});

describe('getMediaDetails', () => {
  test('serves from TMDB when a token and id are present', async () => {
    const result = await Effect.runPromise(
      getMediaDetails(deps([TMDB_MOVIE]), { type: 'MOVIE', tmdbId: 603, traktId: 1 }),
    );

    expect(result.source).toBe('tmdb');
    expect(result.catalogue?.id).toBe('tmdb-movie-603');
    expect(result.cast[0].tmdbId).toBe(6384);
    expect(result.studios[0].id).toBe('tmdb-studio-79');
  });

  test('falls over to Trakt when the TMDB request fails', async () => {
    const result = await Effect.runPromise(
      getMediaDetails(
        deps([['/movie/603', { error: 'boom' }, 500], TRAKT_PEOPLE, TRAKT_STUDIOS]),
        { type: 'MOVIE', tmdbId: 603, traktId: 1 },
      ),
    );

    expect(result.source).toBe('trakt');
    expect(result.catalogue).toBeNull();
    expect(result.cast[0].name).toBe('Keanu Reeves');
    expect(result.studios[0].tmdbId).toBe(79);
  });

  test('goes straight to the provider path without a TMDB token', async () => {
    const result = await Effect.runPromise(
      getMediaDetails(deps([TRAKT_PEOPLE, TRAKT_STUDIOS], { tmdb: false }), {
        type: 'MOVIE',
        tmdbId: 603,
        traktId: 1,
      }),
    );

    expect(result.source).toBe('trakt');
  });

  // Plan 0034 KTD-8: `state/queries/media-details.ts` now passes `trakt: null`
  // when Trakt has no usable client id (BYO-only, post-detachment) — the
  // composer must tolerate that leg being absent exactly like it already
  // tolerates `tmdb: null`, rather than throwing on `deps.trakt.fetch`.
  test('degrades to the empty result when neither TMDB nor Trakt is available', async () => {
    const result = await Effect.runPromise(
      getMediaDetails(deps([], { tmdb: false, trakt: false }), {
        type: 'MOVIE',
        tmdbId: 603,
        traktId: 1,
      }),
    );

    expect(result).toEqual({
      catalogue: null,
      cast: [],
      crew: [],
      studios: [],
      source: 'none',
    });
  });

  test('anime still uses AniList credits when Trakt has no client id at all', async () => {
    const result = await Effect.runPromise(
      getMediaDetails(deps([ANILIST_CREDITS], { tmdb: false, trakt: false }), {
        type: 'ANIME',
        anilistId: 42,
      }),
    );

    expect(result.source).toBe('anilist');
    expect(result.cast[0].name).toBe('Aoi Yuki');
  });

  test('anime without a TMDB id uses AniList credits', async () => {
    const result = await Effect.runPromise(
      getMediaDetails(deps([ANILIST_CREDITS]), { type: 'ANIME', anilistId: 42 }),
    );

    expect(result.source).toBe('anilist');
    expect(result.cast[0].name).toBe('Aoi Yuki');
    expect(result.studios[0].name).toBe('TOHO animation STUDIO');
  });

  // Plan 0024 U8: manga details are AniList-sourced only. Nothing may reach
  // for TMDB — there is no manga there, and a stray request would 404 the
  // screen instead of degrading to the basic view.
  test('manga performs no TMDB request and returns the empty credits shape', async () => {
    const requested: string[] = [];
    const trackingFetch = (input: RequestInfo | URL): Promise<Response> => {
      requested.push(String(input));
      return Promise.resolve(new Response('{}', { status: 404 }));
    };

    const result = await Effect.runPromise(
      getMediaDetails(
        {
          tmdb: { fetch: trackingFetch, token: 'test-token' },
          trakt: { fetch: trackingFetch, tokens, clientId: 'cid', clientSecret: 's' },
          anilist: { fetch: trackingFetch, tokens },
        },
        { type: 'MANGA', anilistId: 42, tmdbId: 603 },
      ),
    );

    expect(requested.some((url) => url.includes('themoviedb'))).toBe(false);
    expect(result.source).toBe('none');
    expect(result.catalogue).toBeNull();
  });

  test('yields the empty result when no source can serve', async () => {
    const result = await Effect.runPromise(
      getMediaDetails(deps([]), { type: 'MOVIE' }),
    );

    expect(result).toEqual({
      catalogue: null,
      cast: [],
      crew: [],
      studios: [],
      source: 'none',
    });
  });
});
