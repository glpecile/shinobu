import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import {
  manualLinkForOutcome,
  manualRowsFor,
} from '@/features/log-media/manual-write-links';
import { OutcomeLink } from '@/features/log-media/outcome-link';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { useIsWatchlisted } from '@/features/watchlist/use-is-watchlisted';
import { haptics } from '@/lib/haptics';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import type { ProviderFailure } from '@/state/queries/settle';
import { useConnectedProviders } from '@/state/session';

import {
  failedOnSentence,
  isUnwatchlistCtaSettled,
  removedFromSentence,
  unwatchlistCtaCopy,
  watchlistResultView,
} from './copy';
import { splitWatchlistRemoveTargets } from './remove-targets';
import {
  useIsUnwatchlistPending,
  useLatestUnwatchlistResult,
  useUnwatchlistMedia,
} from './use-unwatchlist-media';

/**
 * The un-watchlist CTA (plan 0031 U16) — a **sibling** of
 * `WatchlistMediaButton`, structurally identical because R38 says the removal
 * reuses the add's whole contract, and separate because the two differ in the
 * one place that matters: this one is offered against a `WatchlistEntry` and
 * routes off its `sources`.
 *
 * It renders the add's three result families, unchanged in meaning:
 *
 * 1. upfront manual rows, before any tap (R17) — here they cover *two* kinds of
 *    provider, which is R35's whole point. A provider that holds the item but
 *    declares the verb manual (Letterboxd until U6's spike, Serializd until its
 *    read leg lands), **and** a provider whose membership was never knowable:
 *    no read leg, or a leg that errored on this gather. Dropping the second
 *    kind would let a Trakt outage produce a "Removed" label while the film is
 *    still on the user's Trakt watchlist;
 * 2. failed outcomes with their "Remove on {Provider}" links;
 * 3. reasoned skips as individual lines — "wasn't on your watchlist" and
 *    "removing would delete your whole AniList entry, it has a score" are
 *    different facts and only one of them is the boring one. There is no
 *    all-skip headline: the add can honestly collapse "already on Trakt,
 *    AniList" into one sentence, and no sentence collapses those two.
 *
 * **No confirmation dialog, deliberately.** A watchlist entry is a bookmark and
 * the add is one tap away on the same surfaces — with one exception the app
 * handles rather than warns about: AniList's removal destroys the whole list
 * entry, so it refuses (a reasoned skip plus a manual link) for anything
 * carrying user content, inside the effect, on a fresh read (R36). That refusal
 * is a better guarantee than a dialog nobody reads.
 */
export function UnwatchlistMediaButton({
  entry,
  errors = [],
  incomplete = [],
  onCleanReport,
}: {
  entry: WatchlistEntry;
  /** The gather's failed legs (R29) — R35 reads them to tell unknown from absent. */
  errors?: readonly ProviderFailure[];
  /**
   * The gather's *partially read* legs — Letterboxd behind `onEndReached`.
   * Read for the same R35 reason as `errors` and kept separate for the reason
   * `WatchlistInputs['incomplete']` gives: it is not a failure and renders
   * nothing, but a leg that only read page 1 has not proven non-membership.
   */
  incomplete?: readonly ProviderId[];
  /**
   * Fired only for a report with nothing left to read — used by the sheet to
   * close itself. A failure, a reasoned skip or a manual row keeps the surface
   * open: the app has no toast, so closing would surface the report to nobody.
   */
  onCleanReport?: () => void;
}) {
  const connected = useConnectedProviders();
  const remove = useUnwatchlistMedia(entry, errors, incomplete);
  const pending = useIsUnwatchlistPending(entry.item.id);
  const result = useLatestUnwatchlistResult(entry.item.id);

  const onList = useIsWatchlisted(entry.item);

  // Pre-tap split, on the **unenriched** entry item: enrichment only ever
  // widens the applicable set, and the mutation runs the same enrichment
  // through the same cache, so the report's buckets below replace these
  // without a second request — the same fallback shape `useWatchlistTargetsSplit`
  // uses for the add.
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
  // R35: "Removed" is a completeness claim, so it is withheld while any
  // applicable provider's membership was unknown. The rule lives in `copy.ts`
  // so it is checkable without a renderer.
  const settled = isUnwatchlistCtaSettled(onList, view, unknown);

  // Nothing holds this item that can be acted on at all — no button, rather
  // than one that can only fail.
  if (split.targets.length === 0 && split.manual.length === 0 && unknown.length === 0) {
    return null;
  }

  const upfrontManual = manualRowsFor(
    [...(result?.manual ?? split.manual), ...unknown],
    entry.item,
  );

  function unwatchlist() {
    if (pending || settled) return;
    haptics.selection();
    remove.mutate(
      {},
      {
        onSuccess: (report) => {
          if (report.failed.length === 0) haptics.success();
          else haptics.error();
          // Clean means nothing left on screen to read *and* nothing left
          // unknown — an unknown provider's manual row is the only evidence the
          // user gets that the removal was partial.
          if (
            report.succeeded.length > 0 &&
            report.failed.length === 0 &&
            report.skipped.length === 0 &&
            report.manual.length === 0 &&
            report.unknown.length === 0
          ) {
            onCleanReport?.();
          }
        },
        onError: () => haptics.error(),
      },
    );
  }

  return (
    <View className="mb-6">
      {/* morphLabel: "Remove from watchlist" → "Removed" changes in place from
          user state, which is what MorphText is for. `quiet` for the same
          reason the add uses it — this is the other thing you can do here, not
          a second accent-weight decision competing with the log CTA. */}
      <Button
        disabled={settled}
        icon={<Button.Icon name={settled ? 'bookmark-outline' : 'bookmark'} />}
        label={settled ? copy.settled : copy.idle}
        loading={pending}
        loadingLabel={copy.pending}
        morphLabel
        onPress={unwatchlist}
        variant="quiet"
      />

      {/* Family 1 — rendered before any tap, and the only place a manual-only
          or unknown-membership provider is ever mentioned. */}
      {upfrontManual.length > 0 && (
        <View className="mt-3 gap-1 items-center">
          {upfrontManual.map(({ provider, url }) => (
            <OutcomeLink
              key={provider}
              provider={provider}
              tone="neutral"
              url={url}
              verb="Remove on"
            />
          ))}
        </View>
      )}

      {view != null && view.succeeded.length > 0 && (
        <Text className="text-muted font-sans text-sm mt-2">
          {removedFromSentence(view.succeeded)}
        </Text>
      )}

      {/* Family 2. */}
      {view != null && view.failed.length > 0 && (
        <View className="mt-2 gap-1">
          <Text className="text-accent font-sans text-sm">
            {failedOnSentence(view.failed)}
          </Text>
          {view.errorLinks.map(({ provider, url }) => (
            <OutcomeLink
              key={provider}
              provider={provider}
              url={url}
              verb="Remove on"
            />
          ))}
        </View>
      )}

      {/* Family 3 — one line per skip, never lumped. */}
      {view != null && view.reasonedSkips.length > 0 && (
        <View className="mt-2 gap-1">
          {view.reasonedSkips.map((outcome) => {
            const url = manualLinkForOutcome(outcome, entry.item);
            return (
              <View key={outcome.provider}>
                <Text className="text-muted font-sans text-sm">
                  {PROVIDERS[outcome.provider].label}: {outcome.reason}
                </Text>
                {url != null && (
                  <OutcomeLink
                    tone="neutral"
                    provider={outcome.provider}
                    url={url}
                    verb="Remove on"
                  />
                )}
              </View>
            );
          })}
        </View>
      )}

      {remove.isError && (
        <Text className="text-accent font-sans text-sm mt-2">
          Could not remove. Try again.
        </Text>
      )}
    </View>
  );
}
