import { providerHomeUrl, providerItemUrl, type UrlItem } from '@/lib/providers/external-urls';
import type { ProviderId } from '@/lib/providers/types';
import type { ProviderLogOutcome } from './fan-out';

export interface ManualLogRow {
  provider: ProviderId;
  url: string;
}

/**
 * The upfront "log manually" rows for the confirm sheet (plan 0022 R3/R4):
 * one per manual-only target, degrading to the provider's home URL when no
 * item-specific one can be built — the affordance never vanishes silently.
 */
export function manualRowsFor(
  manual: readonly ProviderId[],
  item: UrlItem,
): ManualLogRow[] {
  return manual.map((provider) => ({
    provider,
    url: providerItemUrl(provider, item) ?? providerHomeUrl(provider),
  }));
}

/**
 * The "Log on {Provider}" link for one outcome (plan 0022 R5/R6): any error,
 * or a skip that carries a reason (an adapter-reported skip, e.g. Serializd
 * couldn't resolve a season). A reconcile skip (no reason — already in sync)
 * gets none. Null when `providerItemUrl` can't build one either way — no home
 * URL fallback here, unlike the manual row (R4 is sheet-only).
 */
export function manualLinkForOutcome(
  outcome: ProviderLogOutcome,
  item: UrlItem,
): string | null {
  if (outcome.status === 'error') return providerItemUrl(outcome.provider, item);
  if (outcome.status === 'skipped' && outcome.reason != null) {
    return providerItemUrl(outcome.provider, item);
  }
  return null;
}

export interface ErrorOutcomeLink {
  provider: ProviderId;
  url: string;
}

/**
 * Error outcomes paired with their buildable manual link — for surfaces like
 * `LogMediaButton`'s inline notice that have room only for "Log on
 * {Provider}", not the full per-outcome message `log-confirm-sheet.tsx`
 * renders alongside every error regardless of link buildability.
 */
export function errorOutcomeLinks(
  outcomes: readonly ProviderLogOutcome[],
  item: UrlItem,
): ErrorOutcomeLink[] {
  const links: ErrorOutcomeLink[] = [];
  for (const outcome of outcomes) {
    if (outcome.status !== 'error') continue;
    const url = manualLinkForOutcome(outcome, item);
    if (url != null) links.push({ provider: outcome.provider, url });
  }
  return links;
}
