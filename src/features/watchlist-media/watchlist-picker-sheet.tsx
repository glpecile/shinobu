import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { currentPlatform } from '@/features/log-media/use-log-targets';
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
import type { ProviderId } from '@/lib/providers/types';
import { toast } from '@/lib/toast';
import type { ProviderFailure } from '@/state/queries/settle';
import { watchlistQueryKeys, type WatchlistInputs } from '@/state/queries/watchlist';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import {
  addedToastTitle,
  addedToSentence,
  DESTRUCTIVE_REMOVE_CONFIRM_LABEL,
  destructiveRemoveWarning,
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
      <WriteSheet.Title>{item.title}</WriteSheet.Title>
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
  const [held] = useState(() => {
    const data = queryClient.getQueryData<WatchlistInputs>(
      watchlistQueryKeys.inputs(),
    );
    return data == null ? [] : watchlistSourcesFor(data.inputs, item);
  });
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
      <WriteSheet.Title>{copy.idle}</WriteSheet.Title>
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
          <Text className="text-muted font-sans text-sm mt-2">
            {`Already on ${providerLabelList(alreadyOn)}.`}
          </Text>
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
        <WriteSheet.Cancel onPress={onCancel} />
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
  const pending = useIsUnwatchlistPending(entry.item.id);
  const split = splitWatchlistRemoveTargets(
    entry.item,
    entry.sources,
    connected,
    currentPlatform(),
    errors,
    incomplete,
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

  // R3's explicit confirm, in place rather than as a second stacked sheet: the
  // warning is on screen from the moment a provider whose removal destroys
  // something is a selected target — AniList on a CURRENT entry, Simkl on a
  // row that still holds watch history (plan 0036) — and the first press only
  // arms the button. Two deliberate presses with the loss spelled out between
  // them is what earns `allowDestructive`. Deselecting that provider clears
  // the warning, and with it the arming.
  const [armed, setArmed] = useState(false);
  const warning = destructiveRemoveWarning({
    ...(entry.anilistStatus != null
      ? { anilistStatus: entry.anilistStatus }
      : {}),
    ...(entry.simklWatchedCount != null
      ? { simklWatchedCount: entry.simklWatchedCount }
      : {}),
    targets: selected,
  });

  // Any change to the selection disarms: otherwise dropping AniList from the
  // targets and adding it back would leave a still-armed button that deletes
  // the entry on a single press.
  function disarmThen<A extends unknown[]>(action: (...args: A) => void) {
    return (...args: A) => {
      setArmed(false);
      action(...args);
    };
  }

  function write(providers: ProviderId[]) {
    if (pending || providers.length === 0) return;
    haptics.confirm();
    remove.mutate(
      { providers, ...(warning != null ? { allowDestructive: true } : {}) },
      step.callbacks,
    );
  }

  function confirm() {
    if (warning != null && !armed) {
      if (!pending && selected.length > 0) setArmed(true);
      return;
    }
    write(selected);
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

  return (
    <WriteSheet.Step key="form">
      <WriteSheet.Title>{copy.idle}</WriteSheet.Title>
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
            onSelectAll={disarmThen(selectAll)}
            onSelectNone={disarmThen(selectNone)}
            onToggle={disarmThen(toggle)}
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
      {warning != null && (
        <Text className="text-accent font-sans text-sm mt-3 leading-relaxed">
          {warning}
        </Text>
      )}


      <WriteSheet.Actions>
        <Button
          disabled={selected.length === 0}
          // `trash-outline` only once armed: the second press is the one that
          // deletes an AniList/Simkl entry outright, and the glyph should say so.
          icon={
            <Button.Icon
              name={warning != null && armed ? 'trash-outline' : 'bookmark-outline'}
            />
          }
          label={
            warning != null && armed
              ? DESTRUCTIVE_REMOVE_CONFIRM_LABEL
              : unwatchlistConfirmLabel(entry.item, selected.length)
          }
          loading={pending}
          loadingLabel={copy.pending}
          morphLabel
          onPress={confirm}
        />
        <WriteSheet.Cancel onPress={onCancel} />
      </WriteSheet.Actions>
    </WriteSheet.Step>
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
