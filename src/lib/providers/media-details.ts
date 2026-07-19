import { Effect } from 'effect';

import type { AniListDeps } from '@/lib/providers/anilist/deps';
import { getAnimeCredits } from '@/lib/providers/anilist/credits';
import type { ProviderError } from '@/lib/providers/errors';
import { getMediaCatalogue } from '@/lib/providers/tmdb/reads';
import type { TmdbDeps } from '@/lib/providers/tmdb/deps';
import type { TmdbKind } from '@/lib/providers/tmdb/normalize';
import type { TraktDeps } from '@/lib/providers/trakt/deps';
import {
  getMediaPeople,
  getMediaStudios,
} from '@/lib/providers/trakt/reads';
import type {
  MediaType,
  NormalizedCastMember,
  NormalizedCrewMember,
  NormalizedMediaItem,
  NormalizedStudio,
} from '@/types/media';

/**
 * The TMDB-first metadata contract behind every detail screen (plan 0014):
 * one composed read that prefers TMDB and falls over to the tracker
 * providers when TMDB can't serve — no token wired, no TMDB id known, or the
 * request itself failing. Providers keep user state either way; this is
 * display metadata only.
 */

export interface MediaDetailsDeps {
  /** Null when no TMDB token is configured — straight to the provider path. */
  tmdb: TmdbDeps | null;
  trakt: TraktDeps;
  anilist: AniListDeps;
}

export interface MediaDetails {
  /**
   * TMDB catalogue record to merge over the item's display metadata
   * (`applyPrimaryMetadata`); null when only provider credits were available.
   */
  catalogue: NormalizedMediaItem | null;
  cast: NormalizedCastMember[];
  crew: NormalizedCrewMember[];
  studios: NormalizedStudio[];
  source: 'tmdb' | 'trakt' | 'anilist' | 'none';
}

export interface MediaDetailsParams {
  type: MediaType;
  isFilm?: boolean;
  tmdbId?: number;
  traktId?: number;
  anilistId?: number;
}

/** MediaType → TMDB URL kind, same `isFilm` reasoning as routing.ts. */
export function tmdbKindFor(type: MediaType, isFilm?: boolean): TmdbKind | null {
  if (type === 'MOVIE') return 'movie';
  if (type === 'TV') return 'tv';
  if (type === 'ANIME') return isFilm === true ? 'movie' : 'tv';
  return null; // MANGA has no TMDB representation
}

const EMPTY: MediaDetails = {
  catalogue: null,
  cast: [],
  crew: [],
  studios: [],
  source: 'none',
};

function providerFallback(
  deps: MediaDetailsDeps,
  params: MediaDetailsParams,
): Effect.Effect<MediaDetails, ProviderError> {
  if (params.type === 'ANIME' && params.anilistId != null) {
    return getAnimeCredits(deps.anilist, { mediaId: params.anilistId }).pipe(
      Effect.map((credits) => ({
        catalogue: null,
        cast: credits.cast,
        crew: credits.crew,
        studios: credits.studios,
        source: 'anilist' as const,
      })),
    );
  }
  if (params.traktId != null) {
    return Effect.all(
      {
        people: getMediaPeople(deps.trakt, {
          type: params.type,
          traktId: params.traktId,
        }),
        studios: getMediaStudios(deps.trakt, {
          type: params.type,
          traktId: params.traktId,
        }),
      },
      { concurrency: 2 },
    ).pipe(
      Effect.map(({ people, studios }) => ({
        catalogue: null,
        cast: people.cast,
        crew: people.crew,
        studios,
        source: 'trakt' as const,
      })),
    );
  }
  return Effect.succeed(EMPTY);
}

export function getMediaDetails(
  deps: MediaDetailsDeps,
  params: MediaDetailsParams,
): Effect.Effect<MediaDetails, ProviderError> {
  const kind = tmdbKindFor(params.type, params.isFilm);
  if (deps.tmdb == null || params.tmdbId == null || kind == null) {
    return providerFallback(deps, params);
  }
  const tmdbId = params.tmdbId;
  const tmdb = deps.tmdb;
  return getMediaCatalogue(tmdb, { kind, tmdbId }).pipe(
    Effect.map(
      (result): MediaDetails => ({
        catalogue: result.catalogue,
        cast: result.cast,
        crew: result.crew,
        studios: result.studios,
        source: 'tmdb',
      }),
    ),
    // Any TMDB failure — auth, rate limit exhausted, 5xx, decode — degrades
    // to the provider path instead of blanking the sections.
    Effect.catchAll(() => providerFallback(deps, params)),
  );
}
