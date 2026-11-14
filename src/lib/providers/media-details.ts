import * as Effect from 'effect/Effect';

import type { AniListDeps } from '@/lib/providers/anilist/deps';
import { getAnimeCredits } from '@/lib/providers/anilist/credits';
import type { ProviderError } from '@/lib/providers/errors';
import type { HardcoverDeps } from '@/lib/providers/hardcover/deps';
import { getBook, type HardcoverBookSeries } from '@/lib/providers/hardcover/reads';
import { getMediaCatalogue } from '@/lib/providers/tmdb/reads';
import type { TmdbDeps } from '@/lib/providers/tmdb/deps';
import type { TmdbKind } from '@/lib/providers/tmdb/normalize';
import type { TraktDeps } from '@/lib/providers/trakt/deps';
import {
  getMediaPeople,
  getMediaStudios,
} from '@/lib/providers/trakt/reads';
import { Provider } from '@/lib/providers/types';
import type {
  MediaType,
  NormalizedCastMember,
  NormalizedCharacter,
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
  /**
   * Null when Trakt has no usable client id (plan 0034 KTD-8 — BYO-only post-
   * detachment). `providerFallback` below already tolerates an absent leg the
   * same way it tolerates a null `tmdb`, so a non-BYO build simply has one
   * fewer failover source instead of a doomed unauthenticated request.
   */
  trakt: TraktDeps | null;
  anilist: AniListDeps;
  hardcover: HardcoverDeps;
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
  /** A book's characters. */
  characters?: NormalizedCharacter[];
  /** The series a book belongs to, and its place in it. */
  series?: HardcoverBookSeries;
  /** A book's similar books on Hardcover, most similar first. */
  similarBookIds?: number[];
  source: 'tmdb' | typeof Provider.Trakt | typeof Provider.AniList | typeof Provider.Hardcover | 'none';
}

export interface MediaDetailsParams {
  type: MediaType;
  isFilm?: boolean;
  tmdbId?: number;
  tmdbTvVariant?: number;
  traktId?: number;
  anilistId?: number;
  hardcoverId?: number;
}

/** MediaType → TMDB URL kind, same `isFilm` reasoning as routing.ts. */
export function tmdbKindFor(type: MediaType, isFilm?: boolean): TmdbKind | null {
  if (type === 'MOVIE') return 'movie';
  if (type === 'TV') return 'tv';
  if (type === 'ANIME') return isFilm === true ? 'movie' : 'tv';
  return null; // MANGA and BOOK have no TMDB representation
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
  // Hardcover is a book's only source: its record is the catalogue.
  if (params.type === 'BOOK') {
    if (params.hardcoverId == null) return Effect.succeed(EMPTY);
    return getBook(deps.hardcover, params.hardcoverId).pipe(
      Effect.map((book) => ({
        catalogue: book.item,
        cast: [],
        crew: book.authors,
        studios: [],
        characters: book.characters,
        ...(book.series != null ? { series: book.series } : {}),
        similarBookIds: book.similarBookIds,
        source: Provider.Hardcover,
      })),
    );
  }
  if (params.type === 'ANIME' && params.anilistId != null) {
    return getAnimeCredits(deps.anilist, { mediaId: params.anilistId }).pipe(
      Effect.map((credits) => ({
        catalogue: null,
        cast: credits.cast,
        crew: credits.crew,
        studios: credits.studios,
        source: Provider.AniList,
      })),
    );
  }
  if (params.traktId != null && deps.trakt != null) {
    const trakt = deps.trakt;
    return Effect.all(
      {
        people: getMediaPeople(trakt, {
          type: params.type,
          traktId: params.traktId,
        }),
        studios: getMediaStudios(trakt, {
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
        source: Provider.Trakt,
      })),
    );
  }
  return Effect.succeed(EMPTY);
}

export function getMediaDetails(
  deps: MediaDetailsDeps,
  params: MediaDetailsParams,
): Effect.Effect<MediaDetails, ProviderError> {
  const kind = params.tmdbTvVariant != null ? 'tv' : tmdbKindFor(params.type, params.isFilm);
  const tmdbId = params.tmdbTvVariant ?? params.tmdbId;
  if (deps.tmdb == null || tmdbId == null || kind == null) {
    return providerFallback(deps, params);
  }
  const tmdb = deps.tmdb;
  return getMediaCatalogue(tmdb, { kind, tmdbId }).pipe(
    Effect.map(
      (result): MediaDetails => ({
        // A related series supplies display fields, not movie write IDs or episode progress.
        catalogue: params.tmdbTvVariant == null ? result.catalogue : {
          ...result.catalogue,
          externalIds: {},
          totalEpisodes: undefined,
          runtime: undefined,
          releaseCalendar: undefined,
        },
        cast: result.cast,
        crew: result.crew,
        studios: result.studios,
        source: 'tmdb',
      }),
    ),
    // Any TMDB failure — auth, rate limit exhausted, 5xx, decode — degrades
    // to the provider path instead of blanking the sections.
    Effect.catch(() => providerFallback(deps, params)),
  );
}
