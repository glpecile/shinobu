import { splitSkippedOutcomes } from '@/features/log-media/manual-write-links';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import type { ProviderId } from '@/lib/providers/types';

/** The minimum of any verb's write report this predicate reads. */
export interface WriteReportLike {
  succeeded: readonly ProviderId[];
  failed: readonly ProviderId[];
  outcomes: readonly ProviderWriteOutcome[];
}

/**
 * Whether a write sheet may close itself on this report — and, equivalently,
 * whether the outcome fits in a toast (plan 0032 KTD-3). One predicate feeds
 * both decisions so the sheet can never close on a report the toast then
 * fails to carry: `burnt` has no press handler (R7), so anything left to read
 * — a failure, a reasoned skip, a manual or unknown-membership row, each with
 * its `providerItemUrl` link — must survive on the sheet instead.
 *
 * `leftover` is whatever the verb still has to show after the fan-out:
 * the add passes its `manual` bucket, the removal passes `manual` and
 * `unknown` (R35 — an unknown provider's row is the only evidence the user
 * gets that the removal was partial). Reconcile skips (no reason — already in
 * sync) don't block: with at least one real success they are a footnote, not
 * a recourse.
 */
export function isCleanWriteReport(
  report: WriteReportLike,
  leftover: readonly ProviderId[] = [],
): boolean {
  const { reasonedSkips } = splitSkippedOutcomes(report.outcomes);
  return (
    report.succeeded.length > 0 &&
    report.failed.length === 0 &&
    reasonedSkips.length === 0 &&
    leftover.length === 0
  );
}
