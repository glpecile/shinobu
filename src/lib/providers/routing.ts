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
 * The single "is this anime a film or a series" mapping (plan.md 1.3, plan
 * 0011) — the one rule both routing (`effectiveTypes` below) and the
 * per-provider URL shape (`external-urls.ts`'s `isMovieShaped`/`isShowShaped`)
 * must agree on, so it lives here instead of two hand-written copies.
 */
export function animeEffectiveMovieTvType(item: Pick<NormalizedMediaItem, 'isFilm'>): 'MOVIE' | 'TV' {
  return item.isFilm === true ? 'MOVIE' : 'TV';
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
    const movieTvType = animeEffectiveMovieTvType(item);
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

export interface LogWriteTargetOptions {
  /**
   * A **canonical**-domain batch (the Trakt seasons UI) touching season 2+
   * stays off AniList: a reverse map from a canonical season to the sibling
   * AniList entry that represents it is out of scope (plan 0027 R6/A2), so the
   * only safe move is not to write.
   *
   * This is *not* the anime case any more. An AniList-origin log arrives in the
   * entry's own 1..n numbering, and `useLogMedia` translates it to a canonical
   * season for Trakt/Serializd before routing — so a sequel entry keeps AniList
   * as a target whatever season it maps to, and this flag stays false for it.
   * Routing itself remains pure and network-free (plan 0011 decision 6): it
   * only ever sees the already-translated result.
   */
  nonSeasonOneEpisodes?: boolean;
  /** Caller opt-out — narrows to this subset of the routed targets (the confirm sheet's picker). */
  onlyProviders?: readonly ProviderId[];
  /** `process.env.EXPO_OS` — excludes anything manual-only on this platform (plan 0022 R2/KTD-3). */
  platform: string;
}

/**
 * The full target-resolution pipeline behind a confirmed log write: routed
 * targets, minus AniList for a non-season-1 *canonical* batch, minus caller opt-outs,
 * minus anything manual-only on this platform. Extracted out of `useLogMedia`
 * so the defensive manual-exclusion — the second line of defense against ever
 * writing to a banned target, e.g. Letterboxd on web — is unit-testable
 * without mocking the mutation's QueryClient/adapters.
 */
export function resolveLogWriteTargets(
  item: RoutableItem,
  connected: readonly ProviderId[],
  options: LogWriteTargetOptions,
): ProviderId[] {
  let targets = providersForLog(item, connected);
  if (options.nonSeasonOneEpisodes === true) {
    targets = targets.filter((provider) => provider !== 'anilist');
  }
  if (options.onlyProviders != null && options.onlyProviders.length > 0) {
    const only = options.onlyProviders;
    targets = targets.filter((provider) => only.includes(provider));
  }
  return targets.filter((provider) => !isManualWriteTarget(provider, options.platform));
}
