import {
  okReasonOutcomes,
  splitSkippedOutcomes,
} from '@/features/log-media/manual-write-links';
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
 * fails to carry: `burnt` has no press handler (R7), so **post-write news** —
 * a failed provider or a reasoned skip, each with its `providerItemUrl` link —
 * must survive on the sheet instead.
 *
 * Upfront rows — the add's `manual` bucket, the remove's `manual` and
 * `unknown` — deliberately do *not* block the close (plan 0033 R1/KTD-1):
 * those rows were already on the sheet before the user confirmed, so they are
 * pre-confirm information, not a report. Holding the sheet open to re-show
 * them turned every Trakt+Letterboxd add into a no-toast dead end. Reconcile
 * skips (no reason — already in sync) don't block either: with at least one
 * real success they are a footnote, not a recourse.
 *
 * A *partial* success — an `ok` carrying a reason (plan 0031 R16, Serializd's
 * season-filtered watchlist add) — blocks the close for the same reason a
 * reasoned skip does: "added, except the seasons you've watched" is post-write
 * news the toast cannot carry.
 */
export function isCleanWriteReport(report: WriteReportLike): boolean {
  const { reasonedSkips } = splitSkippedOutcomes(report.outcomes);
  return (
    report.succeeded.length > 0 &&
    report.failed.length === 0 &&
    reasonedSkips.length === 0 &&
    okReasonOutcomes(report.outcomes).length === 0
  );
}
