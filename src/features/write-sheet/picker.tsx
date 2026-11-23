import { useState } from 'react';

import { Button } from '@/components/button';
import { haptics } from '@/lib/haptics';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import { isCleanWriteReport, type WriteReportLike } from './is-clean-report';
import { WriteSheet } from './write-sheet';

/**
 * The state and report step a provider-picker sheet shares (watchlist add and
 * remove, pause and drop).
 *
 * Selection is stored as the *deselected* set: the writable target list can
 * widen while enrichment resolves, and every applicable provider starts
 * selected, so a snapshot of "selected at mount" would drop a provider that
 * arrived a frame later.
 */

/** The selected-set state both verbs share. */
export function useSelectedTargets(targets: readonly ProviderId[]) {
  const [deselected, setDeselected] = useState<readonly ProviderId[]>([]);
  const selected = targets.filter((id) => !deselected.includes(id));

  return {
    selected,
    toggle: (id: ProviderId) =>
      setDeselected(
        deselected.includes(id)
          ? deselected.filter((provider) => provider !== id)
          : [...deselected, id],
      ),
    selectAll: () => setDeselected([]),
    selectNone: () => setDeselected([...targets]),
  };
}

/**
 * The drawer's second step: set from the write's own callbacks, so a retry's
 * pending state doesn't blank the report back to the form.
 */
export function useReportStep<R extends WriteReportLike>(onClean: (report: R) => void) {
  const [report, setReport] = useState<R | null>(null);
  const [thrown, setThrown] = useState(false);
  return {
    report,
    thrown,
    reported: report != null || thrown,
    callbacks: {
      onSuccess: (next: R) => {
        if (isCleanWriteReport(next)) {
          onClean(next);
          return;
        }
        if (next.failed.length > 0) haptics.error();
        setThrown(false);
        setReport(next);
      },
      onError: () => {
        haptics.error();
        setThrown(true);
      },
    },
  };
}

/** What landed, what didn't and why, with a retry for anything that failed. */
export function PickerReport({
  item,
  step,
  succeededLine,
  failedHeadline,
  errorLine,
  verb,
  pending,
  pendingLabel,
  onRetry,
  onDone,
}: {
  item: NormalizedMediaItem;
  step: ReturnType<typeof useReportStep>;
  succeededLine: (succeeded: readonly ProviderId[]) => string;
  failedHeadline: (failed: readonly ProviderId[]) => string;
  errorLine: string;
  verb: string;
  pending: boolean;
  pendingLabel: string;
  onRetry: () => void;
  onDone: () => void;
}) {
  const retryable = step.thrown || (step.report?.failed.length ?? 0) > 0;
  return (
    <>
      <WriteSheet.Header done onClose={onDone}>
        <WriteSheet.Title>{item.title}</WriteSheet.Title>
      </WriteSheet.Header>
      <WriteSheet.Report
        failedHeadline={failedHeadline}
        item={item}
        result={step.report ?? undefined}
        succeededLine={succeededLine}
        verb={verb}
      />
      {step.thrown && <WriteSheet.Error>{errorLine}</WriteSheet.Error>}
      <WriteSheet.Actions>
        {retryable && (
          <Button
            icon={<Button.Icon name="refresh" />}
            label="Try again"
            loading={pending}
            loadingLabel={pendingLabel}
            onPress={onRetry}
          />
        )}
        <Button
          icon={<Button.Icon name="checkmark" />}
          label="Done"
          onPress={onDone}
          variant="quiet"
        />
      </WriteSheet.Actions>
    </>
  );
}
