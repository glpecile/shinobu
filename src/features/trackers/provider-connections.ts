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

export interface SheetAutoCloseInput {
  /** Whether the provider sheet is currently open. */
  open: boolean;
  /** The provider it is open on (kept while closing, hence nullable). */
  sheetId: ProviderId | null;
  /** Whether that provider was *already* connected when the sheet opened. */
  openedConnected: boolean;
  /** Live session state. */
  connectedIds: readonly ProviderId[];
}

/**
 * Should the provider sheet dismiss itself?
 *
 * Yes exactly once: a sheet opened *to connect* whose provider has since become
 * connected. Otherwise every flow ends by stranding the user on a sheet whose
 * job is done — the Serializd WebView closes on capture and hands back a panel
 * that now reads "Connected as glp", which is the moment it has nothing left to
 * offer. Keyed off session state rather than each connect button's success
 * callback, so it covers all four providers (and any fifth) without a new prop.
 *
 * `openedConnected` is what stops a sheet opened on an already-connected
 * provider (to disconnect, say) from vanishing the instant it appears.
 */
export function shouldAutoCloseSheet({
  open,
  sheetId,
  openedConnected,
  connectedIds,
}: SheetAutoCloseInput): boolean {
  if (!open || sheetId == null || openedConnected) return false;
  return connectedIds.includes(sheetId);
}
