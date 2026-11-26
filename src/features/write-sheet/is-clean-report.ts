import { okReasonOutcomes, splitSkippedOutcomes } from '@/features/log-media/manual-write-links';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import type { ProviderId } from '@/lib/providers/types';

export interface WriteReportLike {
  succeeded: readonly ProviderId[];
  failed: readonly ProviderId[];
  queued?: readonly ProviderId[];
  outcomes: readonly ProviderWriteOutcome[];
}

export function isCleanWriteReport(report: WriteReportLike): boolean {
  const { reasonedSkips } = splitSkippedOutcomes(report.outcomes);
  return (
    (report.succeeded.length > 0 || (report.queued?.length ?? 0) > 0) &&
    report.failed.length === 0 &&
    reasonedSkips.length === 0 &&
    okReasonOutcomes(report.outcomes).length === 0
  );
}
