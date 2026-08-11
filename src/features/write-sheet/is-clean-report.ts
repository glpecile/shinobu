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
 * Whether a write sheet may close itself on this report — equivalently, whether
 * the outcome fits in a toast (plan 0032 KTD-3). Toasts are announcement-only
 * (R7), so any post-write news with a recourse link — a failure, a reasoned
 * skip, a partial success — must keep the sheet open; upfront rows and
 * reason-less reconcile skips were visible pre-confirm and don't block.
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
