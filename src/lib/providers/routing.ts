import type { MediaType, NormalizedMediaItem } from '@/types/media';
import { PROVIDERS } from './registry';
import type { ProviderId } from './types';

type RoutableItem = Pick<NormalizedMediaItem, 'type' | 'isFilm'>;

// An anime film is ANIME to AniList but a MOVIE to Trakt/Letterboxd
// (plan.md 1.3), so it matches provider declarations under both types.
function effectiveTypes(item: RoutableItem): readonly MediaType[] {
  return item.type === 'ANIME' && item.isFilm ? ['ANIME', 'MOVIE'] : [item.type];
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
