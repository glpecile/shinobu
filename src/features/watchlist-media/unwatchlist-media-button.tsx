import { View } from 'react-native';

import { Button } from '@/components/button';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { useIsWatchlisted } from '@/features/watchlist/use-is-watchlisted';
import { haptics } from '@/lib/haptics';
import type { ProviderId } from '@/lib/providers/types';
import type { ProviderFailure } from '@/state/queries/settle';
import { useConnectedProviders } from '@/state/session';

import {
  isUnwatchlistCtaSettled,
  unwatchlistCtaCopy,
  watchlistResultView,
} from './copy';
import { splitWatchlistRemoveTargets } from './remove-targets';
import {
  useIsUnwatchlistPending,
  useLatestUnwatchlistResult,
} from './use-unwatchlist-media';

/**
 * The un-watchlist CTA (plan 0031 U16, reshaped by plan 0032) — a **sibling**
 * of `WatchlistMediaButton`, structurally identical because R38 says the
 * removal reuses the add's whole contract, and separate because the two differ
 * in the one place that matters: this one is offered against a
 * `WatchlistEntry` and routes off its `sources`.
 *
 * Like the add, the press **opens the target picker; it does not write**
 * (plan 0032 KTD-4). The result families, the manual rows and R35's
 * unknown-membership rows all render on the picker (`WatchlistRemovePicker`)
 * — this button only decides whether the verb is offered and what its label
 * claims.
 *
 * "Removed" stays a completeness claim (R35): it is withheld while any
 * applicable provider's membership was unknown, so a Trakt outage can never
 * produce a settled label while the film is still on the user's Trakt
 * watchlist. The rule lives in `copy.ts` (`isUnwatchlistCtaSettled`).
 */
export function UnwatchlistMediaButton({
  entry,
  errors = [],
  incomplete = [],
  onOpenPicker,
}: {
  entry: WatchlistEntry;
  /** The gather's failed legs (R29) — R35 reads them to tell unknown from absent. */
  errors?: readonly ProviderFailure[];
  /**
   * The gather's *partially read* legs — Letterboxd behind `onEndReached`.
   * A leg that only read page 1 has not proven non-membership (R35).
   */
  incomplete?: readonly ProviderId[];
  /**
   * The card-actions sheet renders the remove picker in place of its own
   * content (plan 0032 U3) — this button is only ever mounted there (`/watchlist`
   * is the removal's one entry point, R35), so unlike the add it has no
   * self-hosted sheet fallback.
   */
  onOpenPicker: () => void;
}) {
  const connected = useConnectedProviders();
  const pending = useIsUnwatchlistPending(entry.item.id);
  const result = useLatestUnwatchlistResult(entry.item.id);

  const onList = useIsWatchlisted(entry.item);

  // Pre-tap split, on the **unenriched** entry item: enrichment only ever
  // widens the applicable set, and the picker re-derives the same split from
  // the same cache when it opens.
  const split = splitWatchlistRemoveTargets(
    entry.item,
    entry.sources,
    connected,
    currentPlatform(),
    errors,
    incomplete,
  );

  const copy = unwatchlistCtaCopy(entry.item);
  const view = result == null ? null : watchlistResultView(result, entry.item);
  const unknown = result?.unknown ?? split.unknown;
  const settled = isUnwatchlistCtaSettled(onList, view, unknown);

  // Nothing holds this item that can be acted on at all — no button, rather
  // than one that can only fail.
  if (
    split.targets.length === 0 &&
    split.manual.length === 0 &&
    unknown.length === 0
  ) {
    return null;
  }

  function openPicker() {
    if (pending || settled) return;
    haptics.selection();
    onOpenPicker();
  }

  return (
    <View className="mb-6">
      {/* morphLabel: "Remove from watchlist" → "Removed" changes in place from
          user state. `quiet` for the same reason the add uses it — the other
          thing you can do here, not a second accent-weight decision. */}
      <Button
        disabled={settled}
        icon={<Button.Icon name={settled ? 'bookmark-outline' : 'bookmark'} />}
        label={settled ? copy.settled : copy.idle}
        loading={pending}
        loadingLabel={copy.pending}
        morphLabel
        onPress={openPicker}
        variant="quiet"
      />
    </View>
  );
}
