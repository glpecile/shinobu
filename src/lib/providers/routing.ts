import type { MediaType, NormalizedMediaItem } from '@/types/media';
import { PROVIDERS } from './registry';
import type { ProviderId } from './types';

type RoutableItem = Pick<NormalizedMediaItem, 'type' | 'isFilm' | 'externalIds'>;

/** An id Trakt/Letterboxd's movie-TV world can resolve. */
function hasMovieTvIds(item: RoutableItem): boolean {
  const { trakt, tmdb, tvdb, imdb } = item.externalIds;
  return trakt != null || tmdb != null || tvdb != null || imdb != null;
}

/**
 * Anime exists on both sides of the fence (plan.md 1.3, plan 0011): a film is
 * ANIME to AniList but a MOVIE to Trakt/Letterboxd, and an anime *series* is
 * ANIME to AniList but a TV show to Trakt. The cross-provider match only
 * counts when the item actually carries ids for the other side — `useLogMedia`
 * enriches `externalIds` through the ani.zip mapping before routing, so an
 * unmappable item simply logs to its origin provider.
 */
function effectiveTypes(item: RoutableItem): readonly MediaType[] {
  if (item.type === 'ANIME') {
    const movieTvType: MediaType = item.isFilm === true ? 'MOVIE' : 'TV';
    return hasMovieTvIds(item) ? ['ANIME', movieTvType] : ['ANIME'];
  }
  if ((item.type === 'TV' || item.type === 'MOVIE') && item.externalIds.anilist != null) {
    return [item.type, 'ANIME'];
  }
  return [item.type];
}

/**
 * Which providers a log action for `item` fans out to: connected, applicable
 * to the item's (effective) type, and write-capable. `useLogMedia` (todos/005)
 * fires these in parallel and must surface per-provider results — order here
 * follows the caller's `connected` order.
 */
export function providersForLog(
  item: RoutableItem,
  connected: readonly ProviderId[],
): ProviderId[] {
  const types = effectiveTypes(item);
  return connected.filter((id) => {
    const provider = PROVIDERS[id];
    return provider.canWrite && types.some((type) => provider.mediaTypes.includes(type));
  });
}

/**
 * Which providers `useUnifiedFeed` aggregates: connected and read-capable.
 */
export function providersForFeed(connected: readonly ProviderId[]): ProviderId[] {
  return connected.filter((id) => PROVIDERS[id].canRead);
}
