import { useState } from 'react';

import { Button } from '@/components/button';
import { haptics } from '@/lib/haptics';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import { isCleanWriteReport, type WriteReportLike } from './is-clean-report';
import { WriteSheet } from './write-sheet';

export function useSelectedTargets(
  targets: readonly ProviderId[],
  preselected: readonly ProviderId[] = targets,
) {
  const [toggles, setToggles] = useState<Partial<Record<ProviderId, boolean>>>({});
  const selected = targets.filter((id) => toggles[id] ?? preselected.includes(id));
  const setAll = (value: boolean) =>
    setToggles(Object.fromEntries(targets.map((id) => [id, value])));

  return {
    selected,
    toggle: (id: ProviderId) => setToggles({ ...toggles, [id]: !selected.includes(id) }),
    selectAll: () => setAll(true),
    selectNone: () => setAll(false),
  };
}

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
