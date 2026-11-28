import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { FieldLabel } from '@/components/field-label';
import { ProviderIcon } from '@/components/provider-icon';
import { Sheet } from '@/components/sheet';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import { findWatchlistRemoval } from '@/features/watchlist/find-watchlist-removal';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { watchlistSourcesFor } from '@/features/watchlist/use-is-watchlisted';
import type { WriteReportLike } from '@/features/write-sheet/is-clean-report';
import { manualWriteReasons } from '@/features/write-sheet/manual-reasons';
import { ManualWriteRows } from '@/features/write-sheet/manual-write-rows';
import { PickerReport, useReportStep, useSelectedTargets } from '@/features/write-sheet/picker';
import { ProviderToggleList } from '@/features/write-sheet/provider-picker';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { toast } from '@/lib/toast';
import { cachedMangaList } from '@/state/queries/anilist';
import type { ProviderFailure } from '@/state/queries/settle';
import { watchlistQueryKeys, type WatchlistInputs } from '@/state/queries/watchlist';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import {
  addedToastTitle,
  addedToSentence,
  DESTRUCTIVE_REMOVE_CONFIRM_LABEL,
  destructiveProviders,
  removalLine,
  failedOnSentence,
  providerLabelList,
  removedFromSentence,
  removedToastTitle,
  unwatchlistConfirmLabel,
  unwatchlistCtaCopy,
  watchlistConfirmLabel,
  watchlistCtaCopy,
} from './copy';
import { splitWatchlistRemoveTargets } from './remove-targets';
import { useWriteTargetsSplit } from './targets';
import { useIsUnwatchlistPending, useUnwatchlistMedia } from './use-unwatchlist-media';
import { useIsWatchlistWritePending, useWatchlistMedia } from './use-watchlist-media';

interface PickerHostProps {
  onCancel: () => void;
  onCleanClose: () => void;
}

export function WatchlistAddPicker({
  item,
  onCancel,
  onCleanClose,
}: PickerHostProps & { item: NormalizedMediaItem }) {
  const queryClient = useQueryClient();
  const watchlist = useWatchlistMedia(item);
  const pending = useIsWatchlistWritePending(item.id);
  const split = useWriteTargetsSplit(item, 'watchlist');
  const [{ held, removal }] = useState(() => {
    const data = queryClient.getQueryData<WatchlistInputs>(watchlistQueryKeys.inputs());
    return {
      held: data == null ? [] : watchlistSourcesFor(data.inputs, item),
      removal: data == null ? null : findWatchlistRemoval(data, item, cachedMangaList(queryClient)),
    };
  });
  const [removing, setRemoving] = useState(false);
  const writable = split.writable.filter((id) => !held.includes(id));
  const alreadyOn = split.writable.filter((id) => held.includes(id));
  const { manual } = split;
  const { selected, toggle, selectAll, selectNone } = useSelectedTargets(writable);
  const step = useReportStep<WriteReportLike>((report) => {
    toast.success(addedToastTitle(item), providerLabelList(report.succeeded));
    onCleanClose();
  });

  const copy = watchlistCtaCopy(item);

  function write(providers: ProviderId[]) {
    if (pending || providers.length === 0) return;
    haptics.confirm();
    watchlist.mutate({ providers }, step.callbacks);
  }

  if (removing && removal != null) {
    return (
      <WatchlistRemovePicker
        entry={removal.entry}
        errors={removal.errors}
        incomplete={removal.incomplete}
        onCancel={() => setRemoving(false)}
        onCleanClose={onCleanClose}
      />
    );
  }

  if (step.reported) {
    return (
      <WriteSheet.Step key="report">
        <PickerReport
          failedHeadline={failedOnSentence}
          errorLine="Could not add."
          item={item}
          onDone={onCleanClose}
          onRetry={() => write(step.thrown ? selected : [...(step.report?.failed ?? [])])}
          pending={pending}
          pendingLabel={copy.pending}
          step={step}
          succeededLine={addedToSentence}
          verb="Add on"
        />
      </WriteSheet.Step>
    );
  }

  return (
    <WriteSheet.Step key="form">
      <WriteSheet.Header onClose={onCancel}>
        <WriteSheet.Title>{copy.idle}</WriteSheet.Title>
      </WriteSheet.Header>
      <WriteSheet.Description>Choose where “{item.title}” is added.</WriteSheet.Description>

      <View
        className={cn(pending && 'opacity-50')}
        style={{ pointerEvents: pending ? 'none' : 'auto' }}
      >
        <FieldLabel className="mt-5 mb-2">Write to</FieldLabel>
        {writable.length > 0 && (
          <ProviderToggleList
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
          reasons={manualWriteReasons(manual, 'watchlist', currentPlatform())}
          verb="Add on"
        />
        {alreadyOn.length > 0 && (
          <View className="mt-2 rounded-lg border border-border bg-background flex-row items-center gap-3 px-3 py-2">
            <View className="flex-row items-center gap-2 flex-1">
              {alreadyOn.map((id) => (
                <ProviderIcon id={id} key={id} size={18} />
              ))}
              <Text className="text-muted font-sans text-sm flex-1" numberOfLines={1}>
                {`Already on ${providerLabelList(alreadyOn)}`}
              </Text>
            </View>
            {removal != null && (
              <Button
                accessibilityLabel={`Choose where to remove ${item.title} from watchlist`}
                icon={<Button.Icon name="bookmark-outline" />}
                label="Remove"
                onPress={() => {
                  haptics.selection();
                  setRemoving(true);
                }}
                size="sm"
                variant="quiet"
              />
            )}
          </View>
        )}
        {writable.length > 0 && (
          <View className="mt-2 min-h-5">
            {selected.length === 0 && (
              <Text className="text-accent font-sans text-sm">Select at least one provider.</Text>
            )}
          </View>
        )}
      </View>

      <WriteSheet.Actions>
        <Button
          disabled={selected.length === 0}
          icon={<Button.Icon name="bookmark" />}
          label={watchlistConfirmLabel(item, selected.length)}
          loading={pending}
          loadingLabel={copy.pending}
          onPress={() => write(selected)}
        />
      </WriteSheet.Actions>
    </WriteSheet.Step>
  );
}

export function WatchlistRemovePicker({
  entry,
  errors = [],
  incomplete = [],
  onCancel,
  onCleanClose,
}: PickerHostProps & {
  entry: WatchlistEntry;
  errors?: readonly ProviderFailure[];
  incomplete?: readonly ProviderId[];
}) {
  const connected = useConnectedProviders();
  const remove = useUnwatchlistMedia(entry, errors, incomplete);
  const letterboxdUserscript = useLetterboxdUserscript('watchlist-remove');
  const pending = useIsUnwatchlistPending(entry.item.id);
  const split = splitWatchlistRemoveTargets(
    entry.item,
    entry.sources,
    connected,
    currentPlatform(),
    errors,
    incomplete,
    letterboxdUserscript,
  );
  const { selected, toggle, selectAll, selectNone } = useSelectedTargets(split.targets);

  const copy = unwatchlistCtaCopy(entry.item);
  const { manual, unknown } = split;
  const step = useReportStep<WriteReportLike>((report) => {
    toast.success(removedToastTitle(entry.item), providerLabelList(report.succeeded));
    onCleanClose();
  });

  const [reviewed, setReviewed] = useState<ProviderId[] | null>(null);
  const warned = destructiveProviders(reviewed ?? [], entry);
  const destructive = warned.length > 0;

  function write(providers: ProviderId[]) {
    if (pending || providers.length === 0) return;
    haptics.destructive();
    remove.mutate({ providers, destructive: warned }, step.callbacks);
  }

  function review() {
    if (pending || selected.length === 0) return;
    haptics.selection();
    setReviewed(selected);
  }

  if (step.reported) {
    return (
      <WriteSheet.Step key="report">
        <PickerReport
          failedHeadline={failedOnSentence}
          errorLine="Could not remove."
          item={entry.item}
          onDone={onCleanClose}
          onRetry={() => write(step.thrown ? (reviewed ?? []) : [...(step.report?.failed ?? [])])}
          pending={pending}
          pendingLabel={copy.pending}
          step={step}
          succeededLine={removedFromSentence}
          verb="Remove on"
        />
      </WriteSheet.Step>
    );
  }

  if (reviewed != null) {
    return (
      <WriteSheet.Step key="confirm">
        <WriteSheet.Header onClose={onCancel}>
          <WriteSheet.Title>{`Remove “${entry.item.title}”?`}</WriteSheet.Title>
        </WriteSheet.Header>
        <View className="mt-4 gap-3">
          {reviewed.map((provider) => {
            const line = removalLine(provider, entry);
            return (
              <View className="flex-row items-start gap-3" key={provider}>
                <View className="mt-0.5">
                  <ProviderIcon id={provider} size={20} />
                </View>
                <Text
                  className={cn(
                    'flex-1 font-sans text-sm leading-relaxed',
                    line.destructive ? 'text-accent' : 'text-foreground',
                  )}
                >
                  <Text className="font-sans-semibold">{PROVIDERS[provider].label}</Text>
                  {` · ${line.text}`}
                </Text>
              </View>
            );
          })}
        </View>
        <WriteSheet.Actions>
          <Button
            icon={<Button.Icon name={destructive ? 'trash-outline' : 'bookmark-outline'} />}
            label={
              destructive
                ? DESTRUCTIVE_REMOVE_CONFIRM_LABEL
                : unwatchlistConfirmLabel(entry.item, reviewed.length)
            }
            loading={pending}
            loadingLabel={copy.pending}
            onPress={() => write(reviewed)}
          />
          <Button
            disabled={pending}
            icon={<Button.Icon name="chevron-back" />}
            label="Back"
            onPress={() => setReviewed(null)}
            variant="quiet"
          />
        </WriteSheet.Actions>
      </WriteSheet.Step>
    );
  }

  return (
    <WriteSheet.Step key="form">
      <WriteSheet.Header onClose={onCancel}>
        <WriteSheet.Title>{copy.idle}</WriteSheet.Title>
      </WriteSheet.Header>
      <WriteSheet.Description>Choose where “{entry.item.title}” is removed.</WriteSheet.Description>

      <View
        className={cn(pending && 'opacity-50')}
        style={{ pointerEvents: pending ? 'none' : 'auto' }}
      >
        <FieldLabel className="mt-5 mb-2">Remove from</FieldLabel>
        {split.targets.length > 0 && (
          <ProviderToggleList
            onSelectAll={selectAll}
            onSelectNone={selectNone}
            onToggle={toggle}
            selectedProviders={selected}
            targets={split.targets}
          />
        )}
        <ManualWriteRows
          item={entry.item}
          manual={[...manual, ...unknown]}
          reasons={{
            ...manualWriteReasons(manual, 'watchlist-remove', currentPlatform()),
            ...Object.fromEntries(
              unknown.map((provider) => [provider, 'Couldn’t confirm it’s on this list']),
            ),
          }}
          verb="Remove on"
        />
        {split.targets.length > 0 && (
          <View className="mt-2 min-h-5">
            {selected.length === 0 && (
              <Text className="text-accent font-sans text-sm">Select at least one provider.</Text>
            )}
          </View>
        )}
      </View>
      <WriteSheet.Actions>
        <Button
          disabled={selected.length === 0}
          icon={<Button.Icon name="chevron-forward" />}
          label="Continue"
          loading={pending}
          loadingLabel={copy.pending}
          onPress={review}
        />
      </WriteSheet.Actions>
    </WriteSheet.Step>
  );
}

export function WatchlistAddPickerSheet({
  item,
  open,
  onClose,
}: {
  item: NormalizedMediaItem;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} open={open}>
      <WatchlistAddPicker item={item} onCancel={onClose} onCleanClose={onClose} />
    </Sheet>
  );
}

export function WatchlistRemovePickerSheet({
  entry,
  errors,
  incomplete,
  open,
  onClose,
}: {
  entry: WatchlistEntry;
  errors: readonly ProviderFailure[];
  incomplete: readonly ProviderId[];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} open={open}>
      <WatchlistRemovePicker
        entry={entry}
        errors={errors}
        incomplete={incomplete}
        onCancel={onClose}
        onCleanClose={onClose}
      />
    </Sheet>
  );
}
