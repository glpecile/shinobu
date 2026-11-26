import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

export interface ProviderSplit {
  connected: ProviderId[];
  disconnected: ProviderId[];
}

export function splitProviders(connectedIds: readonly ProviderId[]): ProviderSplit {
  const split: ProviderSplit = { connected: [], disconnected: [] };
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
    if (connectedIds.includes(id)) split.connected.push(id);
    else split.disconnected.push(id);
  }
  return split;
}

export interface SheetAutoCloseInput {
  open: boolean;
  sheetId: ProviderId | null;
  openedConnected: boolean;
  connectedIds: readonly ProviderId[];
}

export function shouldAutoCloseSheet({
  open,
  sheetId,
  openedConnected,
  connectedIds,
}: SheetAutoCloseInput): boolean {
  if (!open || sheetId == null || openedConnected) return false;
  return connectedIds.includes(sheetId);
}
