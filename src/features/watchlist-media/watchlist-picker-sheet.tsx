import { useState } from 'react';
import { Text } from 'react-native';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { isCleanWriteReport } from '@/features/write-sheet/is-clean-report';
import { manualWriteReasons } from '@/features/write-sheet/manual-reasons';
import { ManualWriteRows } from '@/features/write-sheet/manual-write-rows';
import { ProviderToggleList } from '@/features/write-sheet/provider-picker';
import { WriteResultReport } from '@/features/write-sheet/write-result-report';
import { haptics } from '@/lib/haptics';
import type { ProviderId } from '@/lib/providers/types';
import { toast } from '@/lib/toast';
import type { ProviderFailure } from '@/state/queries/settle';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import {
  addedToastTitle,
  addedToSentence,
  alreadyOnSentence,
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
 * 2026-07-29): `burnt` has no press handler, so a Trakt 420, an expired
 * Letterboxd session or a reasoned skip with a `providerItemUrl` link would
 * have nowhere to land if the picker were already gone. Only a report with
 * nothing left to read (`isCleanWriteReport`) closes it — and fires the one
 * success toast, from the same predicate, so the sheet can never close on a
 * report the toast then fails to carry (KTD-3).
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
  const watchlist = useWatchlistMedia(item);
  const pending = useIsWatchlistWritePending(item.id);
  const { writable, manual } = useWatchlistTargetsSplit(item);
  const { selected, toggle, selectAll, selectNone } =
    useSelectedTargets(writable);

  const copy = watchlistCtaCopy(item);
  const result = watchlist.data;

  function confirm() {
    if (pending || selected.length === 0) return;
    haptics.confirm();
    watchlist.mutate(
      { providers: selected },
      {
        onSuccess: (report) => {
          if (isCleanWriteReport(report, report.manual)) {
            toast.success(
              addedToastTitle(item),
              providerLabelList(report.succeeded),
            );
            onCleanClose();
          } else if (report.failed.length > 0) {
            haptics.error();
          }
        },
        onError: () => haptics.error(),
      },
    );
  }

  return (
    <>
      <Text className="text-2xl font-display text-foreground">{copy.idle}</Text>
      <Text className="text-muted font-sans text-sm mt-2 leading-relaxed">
        Choose where “{item.title}” is added.
      </Text>

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
      {writable.length > 0 && selected.length === 0 && (
        <Text className="text-accent font-sans text-sm mt-2">
          Select at least one provider.
        </Text>
      )}

      {result != null && result.succeeded.length > 0 && (
        <Text className="text-muted font-sans text-sm mt-3">
          {addedToSentence(result.succeeded)}
        </Text>
      )}
      {result != null && (
        <WriteResultReport
          allSkipLine={alreadyOnSentence}
          failedHeadline={failedOnSentence}
          item={item}
          outcomes={result.outcomes}
          verb="Add on"
        />
      )}
      {watchlist.isError && (
        <Text className="text-accent font-sans text-sm mt-3">
          Could not add. Try again.
        </Text>
      )}

      <Button
        className="mt-6"
        disabled={selected.length === 0}
        label={watchlistConfirmLabel(item, selected.length)}
        loading={pending}
        loadingLabel={copy.pending}
        onPress={confirm}
      />
      <Button
        className="mt-2"
        label="Cancel"
        onPress={onCancel}
        variant="quiet"
      />
    </>
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
  const result = remove.data;
  const manual = result?.manual ?? split.manual;
  const unknown = result?.unknown ?? split.unknown;

  function confirm() {
    if (pending || selected.length === 0) return;
    haptics.confirm();
    remove.mutate(
      { providers: selected },
      {
        onSuccess: (report) => {
          // Clean additionally means nothing left *unknown* (R35) — an unknown
          // provider's manual row is the only evidence the removal was partial.
          if (isCleanWriteReport(report, [...report.manual, ...report.unknown])) {
            toast.success(
              removedToastTitle(entry.item),
              providerLabelList(report.succeeded),
            );
            onCleanClose();
          } else if (report.failed.length > 0) {
            haptics.error();
          }
        },
        onError: () => haptics.error(),
      },
    );
  }

  return (
    <>
      <Text className="text-2xl font-display text-foreground">{copy.idle}</Text>
      <Text className="text-muted font-sans text-sm mt-2 leading-relaxed">
        Choose where “{entry.item.title}” is removed.
      </Text>

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

      {result != null && result.succeeded.length > 0 && (
        <Text className="text-muted font-sans text-sm mt-3">
          {removedFromSentence(result.succeeded)}
        </Text>
      )}
      {/* No all-skip headline, deliberately (plan 0031 U16): "wasn't on your
          watchlist" and "removing would delete your AniList entry" are
          different facts and no sentence collapses them. */}
      {result != null && (
        <WriteResultReport
          failedHeadline={failedOnSentence}
          item={entry.item}
          outcomes={result.outcomes}
          verb="Remove on"
        />
      )}
      {remove.isError && (
        <Text className="text-accent font-sans text-sm mt-3">
          Could not remove. Try again.
        </Text>
      )}

      <Button
        className="mt-6"
        disabled={selected.length === 0}
        label={unwatchlistConfirmLabel(entry.item, selected.length)}
        loading={pending}
        loadingLabel={copy.pending}
        onPress={confirm}
      />
      <Button
        className="mt-2"
        label="Cancel"
        onPress={onCancel}
        variant="quiet"
      />
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
