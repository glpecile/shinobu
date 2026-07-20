import { Clock, Effect } from 'effect';

import { ProviderDecodeError, type ProviderError } from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import { tmdbRequest } from './api';
import type { TmdbDeps } from './deps';
import {
  normalizeCompanySearch,
  normalizeMovieCatalogue,
  normalizePersonDetails,
  normalizePersonSearch,
  normalizeStudioDetails,
  normalizeTitleSearch,
  normalizeTvCatalogue,
  type NormalizedPersonDetails,
  type NormalizedStudioDetails,
  type PersonMatch,
  type TmdbCompanyResponse,
  type TmdbCompanySearchResponse,
  type TmdbDiscoverResponse,
  type TmdbFindResponse,
  type TmdbKind,
  type TmdbMediaCatalogue,
  type TmdbMovieResponse,
  type TmdbPersonResponse,
  type TmdbPersonSearchResponse,
  type TmdbSearchResponse,
  type TmdbTvResponse,
} from './normalize';

/**
 * Bio + full filmography for the person route in one request —
 * `append_to_response=combined_credits` folds the credits into the person
 * document, so the screen never fans out per-section here.
 */
export function getPerson(
  deps: TmdbDeps,
  params: { tmdbId: number },
): Effect.Effect<NormalizedPersonDetails, ProviderError> {
  return Effect.gen(function* () {
    const raw = yield* tmdbRequest<TmdbPersonResponse>(
      deps,
      `/person/${params.tmdbId}?append_to_response=combined_credits`,
    );
    const now = yield* Clock.currentTimeMillis;
    return normalizePersonDetails(raw, new Date(now).toISOString());
  });
}

/**
 * Name → candidate people, for credits whose origin carries no TMDB person
 * id (AniList voice actors/staff). The lookup route picks one via
 * `pickPersonMatch`, never the raw top hit.
 */
export function searchPerson(
  deps: TmdbDeps,
  params: { query: string },
): Effect.Effect<PersonMatch[], ProviderError> {
  return tmdbRequest<TmdbPersonSearchResponse>(
    deps,
    `/search/person?query=${encodeURIComponent(params.query)}&include_adult=false`,
  ).pipe(Effect.map(normalizePersonSearch));
}

/**
 * Catalogue record + credits + studios for one movie/show in a single
 * request — the TMDB-primary payload behind every detail screen (plan 0014).
 * `aggregate_credits` on TV keeps cast stable across seasons.
 */
export function getMediaCatalogue(
  deps: TmdbDeps,
  params: { kind: TmdbKind; tmdbId: number },
): Effect.Effect<TmdbMediaCatalogue, ProviderError> {
  return Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    const catalogue =
      params.kind === 'movie'
        ? normalizeMovieCatalogue(
            yield* tmdbRequest<TmdbMovieResponse>(
              deps,
              `/movie/${params.tmdbId}?append_to_response=credits`,
            ),
            nowIso,
          )
        : normalizeTvCatalogue(
            yield* tmdbRequest<TmdbTvResponse>(
              deps,
              `/tv/${params.tmdbId}?append_to_response=aggregate_credits`,
            ),
            nowIso,
          );
    if (catalogue == null) {
      return yield* new ProviderDecodeError({
        provider: 'tmdb',
        detail: `untitled ${params.kind} record for id ${params.tmdbId}`,
      });
    }
    return catalogue;
  });
}

/**
 * Company profile + its works for the `/studio/[id]` route: one `/company`
 * call and one page of `/discover` per medium, newest first.
 */
export function getStudio(
  deps: TmdbDeps,
  params: { tmdbId: number },
): Effect.Effect<NormalizedStudioDetails, ProviderError> {
  return Effect.gen(function* () {
    const discover = (medium: TmdbKind) =>
      tmdbRequest<TmdbDiscoverResponse>(
        deps,
        `/discover/${medium}?with_companies=${params.tmdbId}&sort_by=${
          medium === 'movie' ? 'primary_release_date' : 'first_air_date'
        }.desc&page=1`,
      );
    const raw = yield* Effect.all(
      {
        company: tmdbRequest<TmdbCompanyResponse>(deps, `/company/${params.tmdbId}`),
        movies: discover('movie'),
        tv: discover('tv'),
      },
      { concurrency: 3 },
    );
    const now = yield* Clock.currentTimeMillis;
    return normalizeStudioDetails(raw, new Date(now).toISOString());
  });
}

/**
 * Title → candidate movies, for items that carry no cross-provider id at all
 * (a Letterboxd watchlist film is slug + title + year). The caller picks the
 * real film with `pickMovieMatch`'s year gate — never the raw top hit
 * (docs/solutions/trakt-text-search-wrong-movie-match.md) — then reads its
 * `externalIds.tmdb`. Unlike the Trakt text-search path, this needs only the
 * builder TMDB token, so a Letterboxd-only user still gets metadata.
 */
export function searchMovie(
  deps: TmdbDeps,
  params: { query: string },
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  return Effect.gen(function* () {
    const raw = yield* tmdbRequest<TmdbSearchResponse>(
      deps,
      `/search/movie?query=${encodeURIComponent(params.query)}&include_adult=false`,
    );
    const now = yield* Clock.currentTimeMillis;
    return normalizeTitleSearch(raw, 'movie', new Date(now).toISOString());
  });
}

/** Name → candidate companies, for studios without a TMDB id (AniList's). */
export function searchCompany(
  deps: TmdbDeps,
  params: { query: string },
): Effect.Effect<PersonMatch[], ProviderError> {
  return tmdbRequest<TmdbCompanySearchResponse>(
    deps,
    `/search/company?query=${encodeURIComponent(params.query)}`,
  ).pipe(Effect.map(normalizeCompanySearch));
}

/**
 * TVDB → TMDB id bridge for TV anime: ani.zip maps most TV anime to TVDB,
 * not TMDB, and `/find` closes the gap. Null when TMDB doesn't index it.
 */
export function findByTvdbId(
  deps: TmdbDeps,
  params: { tvdbId: number },
): Effect.Effect<number | null, ProviderError> {
  return tmdbRequest<TmdbFindResponse>(
    deps,
    `/find/${params.tvdbId}?external_source=tvdb_id`,
  ).pipe(Effect.map((response) => response.tv_results?.[0]?.id ?? null));
}
