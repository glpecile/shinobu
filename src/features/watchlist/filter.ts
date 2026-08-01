import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

import type { WatchlistEntry } from './types';

/**
 * The provider filter on `/watchlist` (owner, 2026-08-01). **Pure**, like
 * `compute.ts` beside it: the screen hands over merged entries and a provider,
 * and gets back rows and counts, so every rule here is unit-testable.
 *
 * It narrows, it does not partition. A merged entry held by both Simkl and
 * Letterboxd appears under *either* filter, because both providers are equally
 * true statements about the same film — the same reasoning that makes
 * `computeWatchlist` merge rather than suppress. Which means the per-provider
 * counts deliberately sum to more than the unfiltered total, and the filtered
 * rows keep their full provider marks: filtering to Letterboxd still shows you
 * that a film is also on Simkl.
 */

/** Registry order, so the filter's option list never depends on gather order. */
const PROVIDER_ORDER = Object.keys(PROVIDERS) as ProviderId[];

/**
 * The `?provider=` query param, validated against the registry. Anything else
 * — a typo, a provider that was removed, an array from a repeated param —
 * reads as "no filter" rather than an error state: a bad URL should show the
 * whole watchlist, never a blank screen.
 */
export function parseWatchlistProvider(raw: unknown): ProviderId | null {
  return typeof raw === 'string' && raw in PROVIDERS ? (raw as ProviderId) : null;
}

/** `null` means every provider — the unfiltered surface. */
export function filterWatchlistEntries(
  entries: readonly WatchlistEntry[],
  provider: ProviderId | null,
): WatchlistEntry[] {
  if (provider == null) return [...entries];
  return entries.filter((entry) => entry.sources.includes(provider));
}

/**
 * How many entries each provider holds, in registry order, providers with
 * nothing omitted. Drives which options the picker offers — a user with three
 * trackers connected but only two holding watchlist rows should not be shown a
 * third filter that yields an empty screen.
 */
export function watchlistProviderCounts(
  entries: readonly WatchlistEntry[],
): { provider: ProviderId; count: number }[] {
  const counts = new Map<ProviderId, number>();
  for (const entry of entries) {
    for (const source of entry.sources) {
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
  }
  return PROVIDER_ORDER.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => ({
    provider: id,
    count: counts.get(id) ?? 0,
  }));
}

/**
 * The options the picker renders. The active provider is always included even
 * when it holds nothing — a deep link to `?provider=letterboxd` whose leg
 * failed this gather must still show *which* filter is on, or the screen reads
 * as "you have no watchlist" with no way back out.
 */
export function watchlistFilterOptions(
  entries: readonly WatchlistEntry[],
  active: ProviderId | null,
): { provider: ProviderId; count: number }[] {
  const counts = watchlistProviderCounts(entries);
  if (active == null || counts.some((option) => option.provider === active)) {
    return counts;
  }
  return PROVIDER_ORDER.filter(
    (id) => id === active || counts.some((option) => option.provider === id),
  ).map((id) => ({
    provider: id,
    count: counts.find((option) => option.provider === id)?.count ?? 0,
  }));
}
