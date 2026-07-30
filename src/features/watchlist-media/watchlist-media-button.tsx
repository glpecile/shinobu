import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/button';
import {
  findWatchlistRemoval,
  type WatchlistRemovalTarget,
} from '@/features/watchlist/find-watchlist-removal';
import { useIsWatchlisted } from '@/features/watchlist/use-is-watchlisted';
import { haptics } from '@/lib/haptics';
import { watchlistQueryKeys, type WatchlistInputs } from '@/state/queries/watchlist';
import type { NormalizedMediaItem } from '@/types/media';

import {
  isWatchlistCtaSettled,
  watchlistCtaCopy,
  watchlistResultView,
} from './copy';
import { useWatchlistTargetsSplit } from './targets';
import {
  WatchlistAddPickerSheet,
  WatchlistRemovePickerSheet,
} from './watchlist-picker-sheet';
import {
  useIsWatchlistWritePending,
  useLatestWatchlistResult,
} from './use-watchlist-media';

/**
 * The want-to-watch CTA (plan 0031 U8, reshaped by plan 0032 KTD-4) — a
 * **sibling** of `LogMediaButton`, never a branch inside it. That component
 * `return null`s for MANGA and for a series whose next episode can't be named,
 * which are exactly the items this one exists for.
 *
 * Since plan 0032 the button **opens the target picker; it does not write**
 * (KTD-4). The three inline result families that used to render under it live
 * on the picker sheet now (R11) — which is what finally let the standing
 * "Add on …" rows leave the details screen: there is no longer a surface under
 * the button a report has to be rendered into.
 *
 * **The settled label is derived from data, not from the mutation** (plan 0031
 * U15, KTD-14). `useIsWatchlisted(item)` reads the gathered watchlists out of
 * the cache, so "On your watchlist" is right after an app restart, right for
 * an item added on another device, and right for one added on the provider's
 * own site. That read **never fetches**: `undefined` (surface never opened) is
 * a first-class answer meaning "we haven't read the watchlist" and renders as
 * the unsettled label, never as a claim of absence.
 *
 * **The settled state is an entry point, not a lock** (plan 0033 follow-up,
 * owner request 2026-07-30): pressing "On your watchlist" opens the *remove*
 * picker, with the entry derived from the same gathered cache the label reads
 * (`findWatchlistRemoval` — cache-only, read at press time). Only the
 * self-hosted form does this: a host that is already a sheet (the card-actions
 * sheet) has its own removal row wired to the gather it owns, and a second
 * sheet stacked over the first is exactly what plan 0032 U3 bans — so in host
 * mode a settled press stays inert.
 *
 * R18's shared pending guard is untouched and must stay: pressto's debounce is
 * per-instance, a card and the sheet over it are two instances, and the picker
 * is now a third — precisely the cross-mount case the shared `mutationKey`
 * guard exists for.
 */
export function WatchlistMediaButton({
  item,
  onOpenPicker,
}: {
  item: NormalizedMediaItem;
  /**
   * Supplied by a host that is *already a sheet* (the card-actions sheet): the
   * press hands the picker to the host to render in place of its own content,
   * never a second sheet stacked over the first (plan 0032 U3). Without it the
   * button hosts `WatchlistAddPickerSheet` itself (the details screen).
   */
  onOpenPicker?: () => void;
}) {
  const queryClient = useQueryClient();
  const pending = useIsWatchlistWritePending(item.id);
  const result = useLatestWatchlistResult(item.id);
  const { writable, manual } = useWatchlistTargetsSplit(item);
  const [open, setOpen] = useState(false);
  // Remounts the picker per open so the selection resets to all-selected (R1).
  const [openNonce, setOpenNonce] = useState(0);
  // The removal target is snapshotted at press time (cache-only read), so the
  // open sheet keeps rendering a consistent entry even while the removal's own
  // invalidation rewrites the gathered cache underneath it.
  const [removal, setRemoval] = useState<WatchlistRemovalTarget | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const onList = useIsWatchlisted(item);

  const copy = watchlistCtaCopy(item);
  const view = result == null ? null : watchlistResultView(result, item);
  // R14/U15's single expression behind one local — membership first, with the
  // mixed-report exception (a failed provider keeps the CTA actionable as a
  // retry entry). The rule lives in `copy.ts` so it is testable without a
  // renderer.
  const settled = isWatchlistCtaSettled(onList, view);

  // Nothing connected can take this item — the same silence `LogMediaButton`
  // keeps rather than offering an action that can only fail.
  if (writable.length === 0 && manual.length === 0) return null;

  function openRemovePicker() {
    // `settled` implies the gathered cache holds a matching input (that is what
    // `useIsWatchlisted` read), so a null here is a race, and no-op is the
    // honest answer — never a fetch (`useIsWatchlisted`'s discipline).
    const data = queryClient.getQueryData<WatchlistInputs>(
      watchlistQueryKeys.inputs(),
    );
    const target = data == null ? null : findWatchlistRemoval(data, item);
    if (target == null) return;
    haptics.selection();
    setRemoval(target);
    setRemoveOpen(true);
  }

  function openPicker() {
    if (pending) return;
    if (settled) {
      // Host mode has no surface for the remove picker that wouldn't stack a
      // second sheet (plan 0032 U3) — the card-actions sheet composes its own
      // removal row instead, so this press is only live when self-hosted.
      if (onOpenPicker == null) openRemovePicker();
      return;
    }
    haptics.selection();
    if (onOpenPicker != null) {
      onOpenPicker();
      return;
    }
    setOpenNonce((nonce) => nonce + 1);
    setOpen(true);
  }

  return (
    <View className="mb-6">
      {/* morphLabel: "Add to watchlist" → "On your watchlist" is a label that
          changes in place from user state, which is exactly what MorphText is
          for. The settled state now opens the remove picker instead of locking
          the button (plan 0033 follow-up). */}
      {/* `quiet` — neutral border, foreground label — the same treatment
          Manage Trackers' Disconnect uses (`provider-card.tsx`), chosen by the
          owner. Never `primary`: this sits directly under the log CTA, and two
          accent-filled blocks of identical weight made "watch it" and "watch it
          later" read as the same decision. */}
      <Button
        disabled={settled && onOpenPicker != null}
        icon={<Button.Icon name={settled ? 'bookmark' : 'bookmark-outline'} />}
        label={settled ? copy.settled : copy.idle}
        loading={pending}
        loadingLabel={copy.pending}
        morphLabel
        onPress={openPicker}
        variant="quiet"
      />
      {onOpenPicker == null && (
        <WatchlistAddPickerSheet
          item={item}
          key={openNonce}
          onClose={() => setOpen(false)}
          open={open}
        />
      )}
      {onOpenPicker == null && removal != null && (
        <WatchlistRemovePickerSheet
          entry={removal.entry}
          errors={removal.errors}
          incomplete={removal.incomplete}
          key={`remove-${removal.entry.id}`}
          onClose={() => setRemoveOpen(false)}
          open={removeOpen}
        />
      )}
    </View>
  );
}
