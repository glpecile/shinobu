import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { enrichExternalIds } from '@/features/log-media/enrich';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import { hasLetterboxdUserscript, useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import { resolveWriteTargets, splitWriteTargets, type WriteCapability } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The watchlist *add* verb's front half (plan 0031 U7).
 *
 * Deliberately `features/watchlist-media/`, not `features/watchlist/`: the
 * latter is the read surface (its compute module and poster wall). Colliding
 * them would make "watchlist" name both a surface you look at and a verb you
 * fire, which is exactly the ambiguity that makes a later reader guess.
 */

/** What `useWatchlistMedia().mutate()` accepts. */
export interface WatchlistMediaVariables {
  /**
   * Caller opt-out — narrows to this subset of the routed targets, the same
   * escape hatch `LogMediaVariables.providers` gives the confirm sheet. The
   * item itself is **not** here: it is fixed at hook-call time so the
   * `mutationKey` can carry its id (R18's shared pending guard).
   */
  providers?: ProviderId[];
}

/**
 * What every watchlist adapter sees. The payload is the `NormalizedMediaItem`
 * and nothing else (KTD-7): there is no episode to resolve — "watchlist S02E05"
 * is not a thing any of the four providers models — and therefore no
 * translation step, no reconcile pass and no ani.zip fetch on this path.
 */
export interface WatchlistWritePayload {
  item: NormalizedMediaItem;
}

export interface WatchlistWritePlan {
  /** The enriched item — every downstream step runs on this, not the caller's copy. */
  item: NormalizedMediaItem;
  /** Providers whose adapter runs, in routing order (the outcome contract's spine). */
  targets: ProviderId[];
  /**
   * Applicable providers the fan-out cannot write — declared `'manual'`
   * (Serializd's watchlist until U10's probe) or platform-banned (Letterboxd
   * on web). Kept beside the targets rather than dropped so R17's deep link
   * can be rendered instead: never a silent absence, never a dead-end error.
   */
  manual: ProviderId[];
}

/**
 * Enrich → route. That is the *whole* plan for this verb — compare
 * `planLogWrite`, which additionally translates episode numbering domains and
 * reconciles against every provider's recorded watch state. Neither applies
 * here (KTD-7), and adding either would buy nothing but requests.
 *
 * Identity enrichment still does apply: a Letterboxd-origin film carries only a
 * slug, and watchlisting it on Trakt needs a trakt/tmdb/imdb id that only
 * `enrichExternalIds` can discover.
 */
export async function planWatchlistWrite(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  connected: readonly ProviderId[],
  variables: WatchlistMediaVariables = {},
): Promise<WatchlistWritePlan> {
  const enriched = await enrichExternalIds(queryClient, item, connected);
  const platform = currentPlatform();
  const letterboxdUserscript = hasLetterboxdUserscript('watchlist');

  const targets = resolveWriteTargets(enriched, connected, {
    capability: 'watchlist',
    platform,
    letterboxdUserscript,
    ...(variables.providers != null ? { onlyProviders: variables.providers } : {}),
  });
  const { manual } = splitWriteTargets(enriched, connected, platform, 'watchlist', letterboxdUserscript);

  return { item: enriched, targets, manual };
}

/**
 * The providers a write of `capability` on `item` would target, split into
 * writable and manual, with the enriched item they were routed on. It renders
 * *before* any tap (R17/plan 0022 R4), so a manual-only provider shows as a
 * manual row rather than silently absent. Falls back to the unenriched split
 * while the mapping loads; enrichment only ever widens, and the mutation runs
 * the same enrichment through the same cache, so confirming refetches nothing.
 */
export function useWriteTargetsSplit(
  item: NormalizedMediaItem,
  capability: Extract<WriteCapability, 'watchlist' | 'tracking'>,
): {
  writable: ProviderId[];
  manual: ProviderId[];
  item: NormalizedMediaItem;
} {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  const platform = currentPlatform();
  // Letterboxd takes no tracking write, so only the watchlist bridge matters.
  const letterboxdUserscript = useLetterboxdUserscript('watchlist');

  const { data: enriched = item } = useQuery({
    queryKey: ['write-targets', item.id, ...connected],
    queryFn: () => enrichExternalIds(queryClient, item, connected),
  });

  return { ...splitWriteTargets(enriched, connected, platform, capability, letterboxdUserscript), item: enriched };
}
