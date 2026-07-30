import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { useIsWatchlisted } from '@/features/watchlist/use-is-watchlisted';
import { haptics } from '@/lib/haptics';
import type { NormalizedMediaItem } from '@/types/media';

import {
  isWatchlistCtaSettled,
  watchlistCtaCopy,
  watchlistResultView,
} from './copy';
import { useWatchlistTargetsSplit } from './targets';
import { WatchlistAddPickerSheet } from './watchlist-picker-sheet';
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
  const pending = useIsWatchlistWritePending(item.id);
  const result = useLatestWatchlistResult(item.id);
  const { writable, manual } = useWatchlistTargetsSplit(item);
  const [open, setOpen] = useState(false);
  // Remounts the picker per open so the selection resets to all-selected (R1).
  const [openNonce, setOpenNonce] = useState(0);

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

  function openPicker() {
    if (pending || settled) return;
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
          for. The settled state also locks the retry — but only when the report
          is complete, never on a mixed one. */}
      {/* `quiet` — neutral border, foreground label — the same treatment
          Manage Trackers' Disconnect uses (`provider-card.tsx`), chosen by the
          owner. Never `primary`: this sits directly under the log CTA, and two
          accent-filled blocks of identical weight made "watch it" and "watch it
          later" read as the same decision. */}
      <Button
        disabled={settled}
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
    </View>
  );
}
