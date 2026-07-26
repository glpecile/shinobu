import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

export interface ProviderSplit {
  /** Providers with a stored session, in registry order. */
  connected: ProviderId[];
  /** Everything else, in registry order. */
  disconnected: ProviderId[];
}

/**
 * Splits the registry into the Manage Trackers screen's two sections.
 *
 * Registry order is the display order for both halves — `useConnectedProviders`
 * returns whatever order MMKV enumerated its keys in, which is connection
 * order, so reading it directly would shuffle the Connected list every time a
 * provider is disconnected and re-added. Deriving both lists from `PROVIDERS`
 * instead keeps the screen stable and makes the registry the only place a
 * provider's position is decided.
 */
export function splitProviders(
  connectedIds: readonly ProviderId[],
): ProviderSplit {
  const split: ProviderSplit = { connected: [], disconnected: [] };
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
    if (connectedIds.includes(id)) split.connected.push(id);
    else split.disconnected.push(id);
  }
  return split;
}
