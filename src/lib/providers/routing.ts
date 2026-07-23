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

/** Whether `provider`'s write is structurally unsupported on `platform` (plan 0022 KTD-1). */
export function isManualWriteTarget(provider: ProviderId, platform: string): boolean {
  return PROVIDERS[provider].unsupportedWritePlatforms?.includes(platform) ?? false;
}

/**
 * Splits `providersForLog`'s targets into what the fan-out can actually write
 * (`writable`) and what it can't on this platform but should still offer as a
 * manual external link (`manual` — plan 0022 R1/R2). Platform is passed in by
 * the caller (`use-log-targets.ts`, from `process.env.EXPO_OS`) so this stays
 * pure and unit-testable, never reading `Platform.OS` itself.
 */
export function splitLogTargets(
  item: RoutableItem,
  connected: readonly ProviderId[],
  platform: string,
): { writable: ProviderId[]; manual: ProviderId[] } {
  const targets = providersForLog(item, connected);
  const manual = targets.filter((id) => isManualWriteTarget(id, platform));
  const writable = targets.filter((id) => !manual.includes(id));
  return { writable, manual };
}
