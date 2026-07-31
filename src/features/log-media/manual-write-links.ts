import { providerHomeUrl, providerItemUrl, type UrlItem } from '@/lib/providers/external-urls';
import type { ProviderId } from '@/lib/providers/types';
import type { ProviderWriteOutcome } from './fan-out';

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
  outcome: ProviderWriteOutcome,
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
  outcomes: readonly ProviderWriteOutcome[],
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

type ReasonedSkip = Extract<ProviderWriteOutcome, { status: 'skipped' }> & { reason: string };

type ReasonedOk = Extract<ProviderWriteOutcome, { status: 'ok' }> & { reason: string };

/**
 * Successes that carry a partial-write reason (plan 0031 R16) — today only
 * Serializd's season-keyed watchlist add produces one ("S1 and S2 are already
 * watched on Serializd"). They render through the same per-line family as
 * reasoned skips, and — like them — they are news the close-and-toast path
 * cannot carry, so `isCleanWriteReport` reads this split too.
 */
export function okReasonOutcomes(
  outcomes: readonly ProviderWriteOutcome[],
): ReasonedOk[] {
  return outcomes.filter(
    (outcome): outcome is ReasonedOk =>
      outcome.status === 'ok' && outcome.reason != null,
  );
}

export interface SkippedOutcomesSplit {
  /** No reason — already in sync (reconcile). Keeps the existing combined "already had this logged" copy. */
  reconcileSkipped: ProviderId[];
  /** Adapter-reported skips (plan 0017 R9, e.g. an unresolvable Serializd season) — each gets its own line + manual link. */
  reasonedSkips: ReasonedSkip[];
}

function hasSkipReason(outcome: ProviderWriteOutcome): outcome is ReasonedSkip {
  return outcome.status === 'skipped' && outcome.reason != null;
}

/**
 * Splits skip outcomes per plan 0022 R6: a reconcile skip (no reason —
 * already in sync) keeps its existing combined copy untouched; an
 * adapter-reported skip (a reason) renders individually alongside its own
 * "Log on {Provider}" link, exactly like an error outcome.
 */
export function splitSkippedOutcomes(
  outcomes: readonly ProviderWriteOutcome[],
): SkippedOutcomesSplit {
  const reconcileSkipped: ProviderId[] = [];
  const reasonedSkips: ReasonedSkip[] = [];
  for (const outcome of outcomes) {
    if (outcome.status !== 'skipped') continue;
    if (hasSkipReason(outcome)) reasonedSkips.push(outcome);
    else reconcileSkipped.push(outcome.provider);
  }
  return { reconcileSkipped, reasonedSkips };
}
