import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { FieldLabel } from '@/components/field-label';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import { failedOnSentence, providerLabelList } from '@/features/watchlist-media/copy';
import { useWriteTargetsSplit } from '@/features/watchlist-media/targets';
import type { WriteReportLike } from '@/features/write-sheet/is-clean-report';
import { manualWriteReasons } from '@/features/write-sheet/manual-reasons';
import { ManualWriteRows } from '@/features/write-sheet/manual-write-rows';
import { PickerReport, useReportStep, useSelectedTargets } from '@/features/write-sheet/picker';
import { ProviderToggleList } from '@/features/write-sheet/provider-picker';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import type { ProviderId, TrackingStatus } from '@/lib/providers/types';
import { toast } from '@/lib/toast';
import type { NormalizedMediaItem } from '@/types/media';

import { useTrackingState } from './use-tracking-state';
import { useIsTrackingStatusPending, useTrackingStatus } from './use-tracking-status';

const COPY = {
  paused: {
    title: 'Pause tracking',
    done: 'Paused',
    verb: 'Pause on',
    pending: 'Pausing…',
    icon: 'pause',
  },
  dropped: {
    title: 'Drop',
    done: 'Dropped',
    verb: 'Drop on',
    pending: 'Dropping…',
    icon: 'close-circle-outline',
  },
} as const;

export function TrackingStatusPicker({
  item,
  status,
  onCancel,
  onCleanClose,
}: {
  item: NormalizedMediaItem;
  status: TrackingStatus;
  onCancel: () => void;
  onCleanClose: () => void;
}) {
  const copy = COPY[status];
  const mutation = useTrackingStatus(item);
  const pending = useIsTrackingStatusPending(item.id);
  const { writable, manual, item: enriched } = useWriteTargetsSplit(item, 'tracking');
  const { labels, movable } = useTrackingState(enriched, writable);
  const { selected, toggle, selectAll, selectNone } = useSelectedTargets(writable, movable[status]);
  const step = useReportStep<WriteReportLike>((report) => {
    toast.success(`${copy.done} “${item.title}”`, providerLabelList(report.succeeded));
    onCleanClose();
  });

  function write(providers: ProviderId[]) {
    if (pending || providers.length === 0) return;
    haptics.confirm();
    mutation.mutate({ status, providers }, step.callbacks);
  }

  if (step.reported) {
    return (
      <WriteSheet.Step key="report">
        <PickerReport
          errorLine={`Could not change the status of “${item.title}”.`}
          failedHeadline={failedOnSentence}
          item={item}
          onDone={onCleanClose}
          onRetry={() => write(step.thrown ? selected : [...(step.report?.failed ?? [])])}
          pending={pending}
          pendingLabel={copy.pending}
          step={step}
          succeededLine={(succeeded) => `${copy.done} on ${providerLabelList(succeeded)}.`}
          verb={copy.verb}
        />
      </WriteSheet.Step>
    );
  }

  return (
    <WriteSheet.Step key="form">
      <WriteSheet.Header onClose={onCancel}>
        <WriteSheet.Title>{copy.title}</WriteSheet.Title>
      </WriteSheet.Header>
      <WriteSheet.Description>
        {item.type === 'BOOK'
          ? 'Pages and reads stay. Log new progress to resume.'
          : 'Watched episodes stay. Log a new episode to resume.'}
      </WriteSheet.Description>

      <View
        className={cn(pending && 'opacity-50')}
        style={{ pointerEvents: pending ? 'none' : 'auto' }}
      >
        <FieldLabel className="mt-5 mb-2">Change on</FieldLabel>
        {writable.length > 0 && (
          <ProviderToggleList
            details={labels}
            onSelectAll={selectAll}
            onSelectNone={selectNone}
            onToggle={toggle}
            selectedProviders={selected}
            targets={writable}
          />
        )}
        <ManualWriteRows
          item={item}
          manual={manual}
          reasons={manualWriteReasons(manual, 'tracking', currentPlatform())}
          verb={copy.verb}
        />
        {manual.length > 0 && (
          <Text className="text-muted font-sans text-sm mt-2">
            {`Up Next keeps it while ${providerLabelList(manual)} still ${manual.length === 1 ? 'tracks' : 'track'} it.`}
          </Text>
        )}
        {writable.length > 0 && (
          // Always mounted while a provider can be picked, so the actions below don't move.
          <View className="mt-2 min-h-5">
            {selected.length === 0 && (
              <Text className="text-accent font-sans text-sm">Select at least one provider.</Text>
            )}
          </View>
        )}
      </View>

      {writable.length > 0 && (
        <WriteSheet.Actions>
          <Button
            disabled={selected.length === 0}
            icon={<Button.Icon name={copy.icon} />}
            label={copy.title}
            loading={pending}
            loadingLabel={copy.pending}
            onPress={() => write(selected)}
          />
        </WriteSheet.Actions>
      )}
    </WriteSheet.Step>
  );
}
