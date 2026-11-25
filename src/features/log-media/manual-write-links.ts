import { providerHomeUrl, providerItemUrl, type UrlItem } from '@/lib/providers/external-urls';
import type { ProviderId } from '@/lib/providers/types';
import type { ProviderWriteOutcome } from './fan-out';

export interface ManualLogRow {
  provider: ProviderId;
  url: string;
}

export function manualRowsFor(
  manual: readonly ProviderId[],
  item: UrlItem,
): ManualLogRow[] {
  return manual.map((provider) => ({
    provider,
    url: providerItemUrl(provider, item) ?? providerHomeUrl(provider),
  }));
}

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

export function okReasonOutcomes(
  outcomes: readonly ProviderWriteOutcome[],
): ReasonedOk[] {
  return outcomes.filter(
    (outcome): outcome is ReasonedOk =>
      outcome.status === 'ok' && outcome.reason != null,
  );
}

export interface SkippedOutcomesSplit {
  reconcileSkipped: ProviderId[];
  reasonedSkips: ReasonedSkip[];
}

function hasSkipReason(outcome: ProviderWriteOutcome): outcome is ReasonedSkip {
  return outcome.status === 'skipped' && outcome.reason != null;
}

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
