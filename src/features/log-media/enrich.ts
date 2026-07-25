import type { QueryClient } from '@tanstack/react-query';

import type { AniZipLookup } from '@/lib/providers/mapping/anizip';
import type { ProviderId } from '@/lib/providers/types';
import {
  cachedAniListFilmId,
  cachedAniZipIds,
  cachedTraktLookup,
  cachedTraktTextSearch,
} from '@/state/queries/mapping';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * Cross-provider identity enrichment (plan 0011 decisions 5–6): before the
 * log fan-out routes, fill in the ids the item's origin provider couldn't
 * know — ani.zip bridges AniList ↔ TVDB/TMDB/IMDB, and a Trakt `/search`
 * lookup turns those into a real Trakt id. Lookups live in
 * `state/queries/mapping.ts` (cached forever — mappings don't churn) and
 * degrade to "no widening" on a miss, so an unmappable item just logs to its
 * origin provider.
 */
export async function enrichExternalIds(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  connected: readonly ProviderId[],
): Promise<NormalizedMediaItem> {
  let externalIds = { ...item.externalIds };

  const isAnime = item.type === 'ANIME';
  const isMovieTv = item.type === 'MOVIE' || item.type === 'TV';

  // A movie carrying no movie-side id at all (a Letterboxd watchlist film is
  // just a slug + title + year) → resolve Trakt/TMDB/IMDB by text search, so a
  // "mark as watched" fans out to Trakt instead of dead-ending on Letterboxd.
  // Runs before the reverse-map below, so the ids it discovers can then bridge
  // an anime film on to AniList too.
  if (
    item.type === 'MOVIE' &&
    externalIds.trakt == null &&
    externalIds.tmdb == null &&
    externalIds.imdb == null &&
    item.title !== '' &&
    connected.includes('trakt')
  ) {
    const found = await cachedTraktTextSearch(queryClient, item.title, item.year);
    if (found != null) {
      externalIds = {
        ...externalIds,
        ...(found.externalIds.trakt != null ? { trakt: found.externalIds.trakt } : {}),
        ...(found.externalIds.tmdb != null ? { tmdb: found.externalIds.tmdb } : {}),
        ...(found.externalIds.imdb != null ? { imdb: found.externalIds.imdb } : {}),
      };
    }
  }

  // AniList-origin anime → movie/TV-side ids (only useful when a movie/TV
  // provider is connected). Serializd needs the tmdb id this yields (KTD2), so
  // an AniList+Serializd-only user must run this too, not just Trakt users.
  if (
    isAnime &&
    externalIds.anilist != null &&
    externalIds.trakt == null &&
    externalIds.tmdb == null &&
    externalIds.tvdb == null &&
    (connected.includes('trakt') || connected.includes('serializd'))
  ) {
    const mapped = await cachedAniZipIds(queryClient, {
      anilistId: externalIds.anilist,
    });
    if (mapped != null) {
      externalIds = {
        ...externalIds,
        ...(mapped.tvdb != null ? { tvdb: mapped.tvdb } : {}),
        ...(mapped.tmdb != null ? { tmdb: mapped.tmdb } : {}),
        ...(mapped.imdb != null ? { imdb: mapped.imdb } : {}),
      };
    }
  }

  // Bridge ids → a real Trakt id (progress reads and cache invalidation key
  // on it; /sync/history alone could live off tvdb/tmdb).
  if (isAnime && externalIds.trakt == null && connected.includes('trakt')) {
    const kind = item.isFilm === true ? 'movie' : 'show';
    const lookup =
      kind === 'show' && externalIds.tvdb != null
        ? { source: 'tvdb' as const, id: externalIds.tvdb }
        : externalIds.tmdb != null
          ? { source: 'tmdb' as const, id: externalIds.tmdb }
          : externalIds.imdb != null
            ? { source: 'imdb' as const, id: externalIds.imdb }
            : null;
    if (lookup != null) {
      const found = await cachedTraktLookup(queryClient, { ...lookup, kind });
      if (found?.externalIds.trakt != null) {
        externalIds = { ...externalIds, trakt: found.externalIds.trakt };
      }
    }
  }

  // Trakt-origin movie/TV → reverse-map into AniList's world.
  if (isMovieTv && externalIds.anilist == null && connected.includes('anilist')) {
    const lookup: AniZipLookup | null =
      item.type === 'TV' && externalIds.tvdb != null
        ? { tvdbId: externalIds.tvdb }
        : item.type === 'MOVIE' && externalIds.tmdb != null
          ? { tmdbId: externalIds.tmdb }
          : null;
    if (lookup != null) {
      const mapped = await cachedAniZipIds(queryClient, lookup);
      if (mapped?.anilist != null) {
        externalIds = { ...externalIds, anilist: mapped.anilist };
      }
    }
  }

  // ani.zip's TMDB index is TV-oriented and misses many anime *films* (ChaO,
  // 2025), so a film opened from a TMDB/Trakt-first details page reverse-maps
  // to nothing above and logs only to Trakt + Letterboxd. Discovery fallback:
  // ask AniList directly, accepting only an exact-year film (KTD3). The
  // discovered id needs no routing change — `effectiveTypes` already widens on
  // `externalIds.anilist != null`. Miss path only, and the lookup (including
  // its misses) is cached forever, so an ordinary live-action film costs one
  // AniList request ever.
  if (
    item.type === 'MOVIE' &&
    externalIds.anilist == null &&
    item.title !== '' &&
    item.year != null &&
    connected.includes('anilist')
  ) {
    const anilistId = await cachedAniListFilmId(queryClient, {
      title: item.title,
      year: item.year,
    });
    if (anilistId != null) externalIds = { ...externalIds, anilist: anilistId };
  }

  return { ...item, externalIds };
}
