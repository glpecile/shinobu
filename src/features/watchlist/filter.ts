import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

import type { WatchlistEntry } from './types';

const PROVIDER_ORDER = Object.keys(PROVIDERS) as ProviderId[];

export function parseWatchlistProvider(raw: unknown): ProviderId | null {
  return typeof raw === 'string' && raw in PROVIDERS ? (raw as ProviderId) : null;
}

export function filterWatchlistEntries(
  entries: readonly WatchlistEntry[],
  provider: ProviderId | null,
): WatchlistEntry[] {
  if (provider == null) return [...entries];
  return entries.filter((entry) => entry.sources.includes(provider));
}

export interface WatchlistFilterOption {
  provider: ProviderId;
  count: number;
  partial: boolean;
}

export function watchlistProviderCounts(
  entries: readonly WatchlistEntry[],
  incomplete: readonly ProviderId[] = [],
): WatchlistFilterOption[] {
  const counts = new Map<ProviderId, number>();
  for (const entry of entries) {
    for (const source of entry.sources) {
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
  }
  return PROVIDER_ORDER.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => ({
    provider: id,
    count: counts.get(id) ?? 0,
    partial: incomplete.includes(id),
  }));
}

export function watchlistTotal(
  entries: readonly WatchlistEntry[],
  incomplete: readonly ProviderId[] = [],
): { count: number; partial: boolean } {
  return { count: entries.length, partial: incomplete.length > 0 };
}

export function formatWatchlistCount(count: number, partial: boolean): string {
  return partial ? `${count}+` : String(count);
}

export function watchlistFilterOptions(
  entries: readonly WatchlistEntry[],
  active: ProviderId | null,
  incomplete: readonly ProviderId[] = [],
): WatchlistFilterOption[] {
  const counts = watchlistProviderCounts(entries, incomplete);
  if (active == null || counts.some((option) => option.provider === active)) {
    return counts;
  }
  return PROVIDER_ORDER.filter(
    (id) => id === active || counts.some((option) => option.provider === id),
  ).map(
    (id) =>
      counts.find((option) => option.provider === id) ?? {
        provider: id,
        count: 0,
        partial: incomplete.includes(id),
      },
  );
}
