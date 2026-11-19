import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ProviderIcon } from '@/components/provider-icon';
import { Sheet } from '@/components/sheet';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import { findWatchlistRemoval } from '@/features/watchlist/find-watchlist-removal';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { watchlistSourcesFor } from '@/features/watchlist/use-is-watchlisted';
import {
  isCleanWriteReport,
  type WriteReportLike,
} from '@/features/write-sheet/is-clean-report';
import { manualWriteReasons } from '@/features/write-sheet/manual-reasons';
import { ManualWriteRows } from '@/features/write-sheet/manual-write-rows';
import { ProviderToggleList } from '@/features/write-sheet/provider-picker';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useThemeColor } from '@/lib/theme-color';
import { toast } from '@/lib/toast';
import type { ProviderFailure } from '@/state/queries/settle';
import { watchlistQueryKeys, type WatchlistInputs } from '@/state/queries/watchlist';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import {
  addedToastTitle,
  addedToSentence,
  DESTRUCTIVE_REMOVE_CONFIRM_LABEL,
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
import { removalItem, splitWatchlistRemoveTargets } from './remove-targets';
import { useWatchlistTargetsSplit } from './targets';
import {
  useIsUnwatchlistPending,
  useUnwatchlistMedia,
} from './use-unwatchlist-media';
import {
  useIsWatchlistWritePending,
  useWatchlistMedia,
} from './use-watchlist-media';

/**
 * The watchlist verbs' target picker (plan 0032 U3) — the sheet both the add
 * and the remove confirm through, composed from the shared `write-sheet`
 * pieces (R2/KTD-1), never a second implementation of the toggle rules.
 *
 * The sheet **stays mounted until the report settles** (R4, owner decision
 * 2026-07-29): toasts carry no press handlers (R7), so a Trakt 420, an expired
 * Letterboxd session or a reasoned skip with a `providerItemUrl` link would
 * have nowhere to land if the picker were already gone. Only a report with
 * nothing left to read (`isCleanWriteReport`) closes it — and fires the one
 * success toast, from the same predicate, so the sheet can never close on a
 * report the toast then fails to carry (KTD-3). Any other report replaces the
 * form as the drawer's next step (`WriteSheet.Step`), like the catch-up chain.
 *
 * Selection is stored as the *deselected* set: the writable target list can
 * widen while enrichment resolves (`useWatchlistTargetsSplit` falls back to
 * the unenriched split first), and R1 says every applicable provider starts
 * selected — a snapshot of "selected at mount" would silently drop a provider
 * that arrived a frame later.
 */

/** The selected-set state both verbs share. */
function useSelectedTargets(targets: readonly ProviderId[]) {
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
function useReportStep<R extends WriteReportLike>(onClean: (report: R) => void) {
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
function PickerReport({
  item,
  step,
  succeededLine,
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
        failedHeadline={failedOnSentence}
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

interface PickerHostProps {
  /** Cancel / dismiss — the hosting surface decides what "back" means. */
  onCancel: () => void;
  /** A clean report settled into a toast — the hosting surface closes fully. */
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
  const split = useWatchlistTargetsSplit(item);
  // Who already holds it, per the gathered watchlists — read once at open
  // (cache-only, never a fetch), so the write's own invalidation can't shift
  // the rows mid-sheet. A cold cache holds nothing and offers every target.
  const [{ held, removal }] = useState(() => {
    const data = queryClient.getQueryData<WatchlistInputs>(
      watchlistQueryKeys.inputs(),
    );
    return {
      held: data == null ? [] : watchlistSourcesFor(data.inputs, item),
      removal: data == null ? null : findWatchlistRemoval(data, item),
    };
  });
  const [removing, setRemoving] = useState(false);
  const writable = split.writable.filter((id) => !held.includes(id));
  const alreadyOn = split.writable.filter((id) => held.includes(id));
  const { manual } = split;
  const { selected, toggle, selectAll, selectNone } =
    useSelectedTargets(writable);
  // Upfront manual rows don't block the close (plan 0033 R1) — they were on
  // the sheet before confirm, so they aren't news.
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
          errorLine="Could not add."
          item={item}
          onDone={onCleanClose}
          onRetry={() =>
            write(step.thrown ? selected : [...(step.report?.failed ?? [])])
          }
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

      {/* Frozen while the fan-out runs, like `LogFormFields`: a target toggled
          mid-write would land on some providers and not others. */}
      <View
        className={cn(pending && 'opacity-50')}
        style={{ pointerEvents: pending ? 'none' : 'auto' }}
      >
        <Text className="text-foreground font-sans-semibold text-sm mt-5 mb-2">
          Write to
        </Text>
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
        {writable.length > 0 && selected.length === 0 && (
          <Text className="text-accent font-sans text-sm mt-2">
            Select at least one provider.
          </Text>
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
    removalItem(entry),
    entry.sources,
    connected,
    currentPlatform(),
    errors,
    incomplete,
    letterboxdUserscript,
  );
  const { selected, toggle, selectAll, selectNone } = useSelectedTargets(
    split.targets,
  );

  const copy = unwatchlistCtaCopy(entry.item);
  const { manual, unknown } = split;
  // Neither `manual` nor `unknown` blocks the close (plan 0033 KTD-1): both
  // render in the same pre-confirm row slot, so they aren't news. R35's
  // "withhold Removed" concern lives on the settled label, which reads
  // membership, not this report.
  const step = useReportStep<WriteReportLike>((report) => {
    toast.success(removedToastTitle(entry.item), providerLabelList(report.succeeded));
    onCleanClose();
  });

  // R3's explicit confirm, as the drawer's next step rather than a second
  // stacked sheet: the first press shows, one line per selected provider,
  // what goes — AniList's whole entry when it's CURRENT, Simkl's watch
  // history (plan 0036) — and only the press on that step writes. Seeing the
  // loss spelled out is what earns `allowDestructive`.
  const [confirming, setConfirming] = useState(false);
  const destructive = selected.some((provider) => removalLine(provider, entry).destructive);

  function write(providers: ProviderId[]) {
    if (pending || providers.length === 0) return;
    haptics.destructive();
    remove.mutate(
      { providers, ...(destructive ? { allowDestructive: true } : {}) },
      step.callbacks,
    );
  }

  function review() {
    if (pending || selected.length === 0) return;
    haptics.selection();
    setConfirming(true);
  }

  if (step.reported) {
    return (
      <WriteSheet.Step key="report">
        <PickerReport
          errorLine="Could not remove."
          item={entry.item}
          onDone={onCleanClose}
          onRetry={() =>
            write(step.thrown ? selected : [...(step.report?.failed ?? [])])
          }
          pending={pending}
          pendingLabel={copy.pending}
          step={step}
          succeededLine={removedFromSentence}
          verb="Remove on"
        />
      </WriteSheet.Step>
    );
  }

  if (confirming) {
    return (
      <WriteSheet.Step key="confirm">
        <RemoveConfirm
          destructive={destructive}
          entry={entry}
          onBack={() => setConfirming(false)}
          onCancel={onCancel}
          onRemove={() => write(selected)}
          pending={pending}
          pendingLabel={copy.pending}
          selected={selected}
        />
      </WriteSheet.Step>
    );
  }

  return (
    <WriteSheet.Step key="form">
      <WriteSheet.Header onClose={onCancel}>
        <WriteSheet.Title>{copy.idle}</WriteSheet.Title>
      </WriteSheet.Header>
      <WriteSheet.Description>
        Choose where “{entry.item.title}” is removed.
      </WriteSheet.Description>

      {/* Frozen while the fan-out runs, like `LogFormFields`: a target toggled
          mid-write would land on some providers and not others. */}
      <View
        className={cn(pending && 'opacity-50')}
        style={{ pointerEvents: pending ? 'none' : 'auto' }}
      >
        <Text className="text-foreground font-sans-semibold text-sm mt-5 mb-2">
          Remove from
        </Text>
        {split.targets.length > 0 && (
          <ProviderToggleList
            onSelectAll={selectAll}
            onSelectNone={selectNone}
            onToggle={toggle}
            selectedProviders={selected}
            targets={split.targets}
          />
        )}
        {/* Manual-declared holders and unknown-membership providers share the
            row slot (plan 0032 U3): identical on screen, different reasons. */}
        <ManualWriteRows
          item={entry.item}
          manual={[...manual, ...unknown]}
          reasons={{
            ...manualWriteReasons(manual, 'watchlist-remove', currentPlatform()),
            ...Object.fromEntries(
              unknown.map((provider) => [
                provider,
                'Couldn’t confirm it’s on this list',
              ]),
            ),
          }}
          verb="Remove on"
        />
        {split.targets.length > 0 && selected.length === 0 && (
          <Text className="text-accent font-sans text-sm mt-2">
            Select at least one provider.
          </Text>
        )}
      </View>
      <WriteSheet.Actions>
        <Button
          disabled={selected.length === 0}
          icon={<Button.Icon name="bookmark-outline" />}
          label={unwatchlistConfirmLabel(entry.item, selected.length)}
          loading={pending}
          loadingLabel={copy.pending}
          morphLabel
          onPress={review}
        />
      </WriteSheet.Actions>
    </WriteSheet.Step>
  );
}

/**
 * The removal's confirm step, in the same drawer: what goes from each selected
 * provider, then the write. Back returns to the selection with it intact.
 */
function RemoveConfirm({
  entry,
  selected,
  destructive,
  pending,
  pendingLabel,
  onRemove,
  onBack,
  onCancel,
}: {
  entry: WatchlistEntry;
  selected: readonly ProviderId[];
  destructive: boolean;
  pending: boolean;
  pendingLabel: string;
  onRemove: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const foreground = useThemeColor('--color-foreground');
  return (
    <>
      <WriteSheet.Header onClose={onCancel}>
        <View className="size-12 rounded-2xl border border-border bg-background items-center justify-center mb-4">
          <Ionicons
            accessibilityElementsHidden
            color={foreground}
            importantForAccessibility="no"
            name={destructive ? 'trash-outline' : 'bookmark-outline'}
            size={24}
          />
        </View>
        <WriteSheet.Title>{`Remove “${entry.item.title}”?`}</WriteSheet.Title>
      </WriteSheet.Header>
      <View className="mt-4 gap-3">
        {selected.map((provider) => {
          const line = removalLine(provider, entry);
          return (
            <View className="flex-row items-start gap-3" key={provider}>
              <ProviderIcon id={provider} size={20} />
              <Text className={cn('flex-1 font-sans text-sm leading-relaxed', line.destructive ? 'text-accent' : 'text-foreground')}>
                <Text className="font-sans-semibold">{PROVIDERS[provider].label}</Text>
                {` · ${line.text}`}
              </Text>
            </View>
          );
        })}
      </View>
      <WriteSheet.Actions>
        <Button
          disabled={selected.length === 0}
          icon={<Button.Icon name={destructive ? 'trash-outline' : 'bookmark-outline'} />}
          label={destructive ? DESTRUCTIVE_REMOVE_CONFIRM_LABEL : unwatchlistConfirmLabel(entry.item, selected.length)}
          loading={pending}
          loadingLabel={pendingLabel}
          onPress={onRemove}
        />
        <Button
          disabled={pending}
          icon={<Button.Icon name="chevron-back" />}
          label="Back"
          onPress={onBack}
          variant="quiet"
        />
      </WriteSheet.Actions>
    </>
  );
}

/**
 * The self-hosted form, for surfaces that aren't already inside a sheet (the
 * details screen). The card-actions sheet composes the pickers directly
 * instead — its row opens the picker *in place of* itself, never a second
 * sheet stacked over the first (plan 0032 U3).
 */
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

/**
 * The removal's self-hosted form — what the details screen's settled CTA opens
 * (plan 0033 follow-up, owner request 2026-07-30): "On your watchlist" is an
 * entry point to removing, not a dead end. The card-actions sheet keeps
 * composing `WatchlistRemovePicker` directly, exactly like the add.
 */
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
