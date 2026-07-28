import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Button } from '@/components/button';
import {
  manualLinkForOutcome,
  manualRowsFor,
} from '@/features/log-media/manual-write-links';
import { OutcomeLink } from '@/features/log-media/outcome-link';
import { haptics } from '@/lib/haptics';
import { PROVIDERS } from '@/lib/providers/registry';
import type { NormalizedMediaItem } from '@/types/media';

import {
  addedToSentence,
  alreadyOnSentence,
  failedOnSentence,
  isCleanWatchlistReport,
  watchlistCtaCopy,
  watchlistResultView,
} from './copy';
import { useWatchlistTargetsSplit } from './targets';
import {
  useIsWatchlistWritePending,
  useLatestWatchlistResult,
  useWatchlistMedia,
} from './use-watchlist-media';

/**
 * The want-to-watch CTA (plan 0031 U8) — a **sibling** of `LogMediaButton`,
 * never a branch inside it. That component `return null`s for MANGA and for a
 * series whose next episode can't be named, which are exactly the items this
 * one exists for; folding the verbs together would delete the affordance
 * wherever it matters most.
 *
 * No confirm sheet (KTD-8): the payload is `{ item }` and nothing else, the
 * entry is a reversible bookmark, and the write is one small POST per provider
 * with no reconcile in front of it — a modal here would contain only the button
 * already tapped. What the sheet *did* render still has to appear, so the
 * result surface below carries all three families it owned:
 *
 * 1. upfront manual rows, before any tap (R17) — without them a manual-declared
 *    target produces no outcome and therefore renders nothing at all, which is
 *    the silent drop the no-dead-end rule forbids;
 * 2. failed outcomes with their "Add on {Provider}" links;
 * 3. reasoned skips as individual lines, each with its own link — plus the
 *    all-skip headline, the most common repeat interaction and the one the log
 *    button's rendering (a suffix to a success line) would show as nothing.
 */
export function WatchlistMediaButton({
  item,
  onCleanReport,
}: {
  item: NormalizedMediaItem;
  /**
   * Fired only for a report with nothing left to read — used by the sheet
   * entry point to close itself. A failure, a reasoned skip or a manual row
   * keeps the surface open: this is a multi-provider network write, the app has
   * no toast, and the user is typically on a surface with no details screen
   * behind it, so closing would surface the report to nobody.
   */
  onCleanReport?: () => void;
}) {
  const watchlist = useWatchlistMedia(item);
  const pending = useIsWatchlistWritePending(item.id);
  const result = useLatestWatchlistResult(item.id);
  const { writable, manual } = useWatchlistTargetsSplit(item);
  const accent = useCSSVariable('--color-accent');
  const accentColor = typeof accent === 'string' ? accent : undefined;

  const copy = watchlistCtaCopy(item);
  const view = result == null ? null : watchlistResultView(result, item);
  // R14's single expression behind one local: U15 swaps this line for
  // `useIsWatchlisted(item)` and deletes nothing else.
  const settled = view?.settled === true;

  // Nothing connected can take this item — the same silence `LogMediaButton`
  // keeps rather than offering an action that can only fail.
  if (writable.length === 0 && manual.length === 0) return null;

  const upfrontManual = manualRowsFor(result?.manual ?? manual, item);

  function add() {
    if (pending || settled) return;
    haptics.selection();
    watchlist.mutate(
      {},
      {
        onSuccess: (report) => {
          if (report.failed.length === 0) haptics.success();
          else haptics.error();
          if (isCleanWatchlistReport(report)) onCleanReport?.();
        },
        onError: () => haptics.error(),
      },
    );
  }

  return (
    <View className="mb-6">
      {/* morphLabel: "Add to watchlist" → "On your watchlist" is a label that
          changes in place from user state, which is exactly what MorphText is
          for. The settled state also locks the retry — but only when the report
          is complete, never on a mixed one. */}
      <Button
        disabled={settled}
        label={settled ? copy.settled : copy.idle}
        loading={pending}
        loadingLabel={copy.pending}
        morphLabel
        onPress={add}
        variant={settled ? 'quiet' : 'primary'}
      />

      {/* Family 1 — rendered before any tap. */}
      {upfrontManual.length > 0 && (
        <View className="mt-2 gap-1">
          {upfrontManual.map(({ provider, url }) => (
            <OutcomeLink
              accentColor={accentColor}
              key={provider}
              provider={provider}
              url={url}
              verb="Add on"
            />
          ))}
        </View>
      )}

      {view != null && view.succeeded.length > 0 && (
        <Text className="text-muted font-sans text-sm mt-2">
          {addedToSentence(view.succeeded)}
        </Text>
      )}

      {view?.allSkip === true && (
        <Text className="text-muted font-sans text-sm mt-2">
          {alreadyOnSentence(view.reasonedSkips)}
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
              accentColor={accentColor}
              key={provider}
              provider={provider}
              url={url}
              verb="Add on"
            />
          ))}
        </View>
      )}

      {/* Family 3 — one line per skip, never lumped: "AniList: already on your
          watchlist" and "Serializd: S1–S2 are already watched" are different
          facts and only one of them is the boring one. */}
      {view != null && view.reasonedSkips.length > 0 && (
        <View className="mt-2 gap-1">
          {view.reasonedSkips.map((outcome) => {
            const url = manualLinkForOutcome(outcome, item);
            return (
              <View key={outcome.provider}>
                <Text className="text-muted font-sans text-sm">
                  {PROVIDERS[outcome.provider].label}: {outcome.reason}
                </Text>
                {url != null && (
                  <OutcomeLink
                    accentColor={accentColor}
                    provider={outcome.provider}
                    url={url}
                    verb="Add on"
                  />
                )}
              </View>
            );
          })}
        </View>
      )}

      {watchlist.isError && (
        <Text className="text-accent font-sans text-sm mt-2">
          Could not add. Try again.
        </Text>
      )}
    </View>
  );
}
