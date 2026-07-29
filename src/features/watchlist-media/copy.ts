import {
  errorOutcomeLinks,
  splitSkippedOutcomes,
  type ErrorOutcomeLink,
  type SkippedOutcomesSplit,
} from '@/features/log-media/manual-write-links';
import type { UrlItem } from '@/lib/providers/external-urls';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The watchlist CTA's copy and its result-surface derivation (plan 0031 U8,
 * R14/R17, KTD-8), kept out of the component so both are unit-testable — this
 * app renders nothing in tests, so any decision left inside JSX is a decision
 * nothing checks.
 *
 * Copy rules that are requirements, not taste: no tagline names a provider
 * (provider names appear only in *results*), and nothing anywhere says "fan
 * out" or any other mechanism word.
 */

/** Read-intent items say "reading list"; everything else says "watchlist". */
export function isReadIntent(item: Pick<NormalizedMediaItem, 'type'>): boolean {
  return item.type === 'MANGA';
}

export interface WatchlistCtaCopy {
  /** Before the write, and after any report that doesn't settle it. */
  idle: string;
  /** The in-place morph target once the item is on the list. */
  settled: string;
  /** Reads under the spinner while the write is in flight. */
  pending: string;
}

export function watchlistCtaCopy(
  item: Pick<NormalizedMediaItem, 'type'>,
): WatchlistCtaCopy {
  return isReadIntent(item)
    ? {
        idle: 'Add to reading list',
        settled: 'On your reading list',
        pending: 'Adding…',
      }
    : {
        idle: 'Add to watchlist',
        settled: 'On your watchlist',
        pending: 'Adding…',
      };
}

/**
 * The removal CTA's copy (plan 0031 U16, R38). Same three-slot shape as the add
 * so one component pattern renders both, and — R38, verbatim — **no provider
 * name in any label**: "Remove from watchlist" is one decision the user makes
 * about their watchlist, not four decisions about four trackers. Provider names
 * appear only in the *result* sentences below and in `OutcomeLink`'s rows.
 */
export function unwatchlistCtaCopy(
  item: Pick<NormalizedMediaItem, 'type'>,
): WatchlistCtaCopy {
  return isReadIntent(item)
    ? {
        idle: 'Remove from reading list',
        settled: 'Removed',
        pending: 'Removing…',
      }
    : {
        idle: 'Remove from watchlist',
        settled: 'Removed',
        pending: 'Removing…',
      };
}

/** Mirrors `log-confirm-sheet`'s `labels`, without dragging a JSX module in. */
export function providerLabelList(ids: readonly ProviderId[]): string {
  return ids.map((id) => PROVIDERS[id].label).join(', ');
}

/** The minimum of `WatchlistMediaResult` this module reads. */
export interface WatchlistReportLike {
  succeeded: readonly ProviderId[];
  failed: readonly ProviderId[];
  outcomes: readonly ProviderWriteOutcome[];
  /** Applicable providers the fan-out cannot write — R17's deep-link rows. */
  manual: readonly ProviderId[];
}

export interface WatchlistResultView {
  /** `ok` providers, in routing order. */
  succeeded: readonly ProviderId[];
  /** `error` providers, in routing order. */
  failed: readonly ProviderId[];
  /** Family 2: one "Add on {Provider}" link per error that can build one. */
  errorLinks: ErrorOutcomeLink[];
  /** Family 3: reason-carrying skips, never lumped into one sentence. */
  reasonedSkips: SkippedOutcomesSplit['reasonedSkips'];
  /**
   * Every applicable provider reported an already-there skip. The most common
   * repeat interaction, and the one the log button's rendering would show as
   * *nothing* (its skip copy is a suffix to a success line that isn't there).
   */
  allSkip: boolean;
}

/**
 * There is deliberately **no `settled` field here** (plan 0031 U15, KTD-14).
 * PR A derived the CTA's settled label from this report — session-scoped
 * evidence that evaporated on restart, was blind to an add made on another
 * device, and blind to one made on the provider's own site. The truth source is
 * now `useIsWatchlisted(item)`, a cache-only read over the gathered watchlists.
 * The report keeps carrying what a membership fact cannot: which provider
 * failed, which one skipped and why. Don't reintroduce a settled boolean here.
 */

export function watchlistResultView(
  result: WatchlistReportLike,
  item: UrlItem,
): WatchlistResultView {
  const { reasonedSkips } = splitSkippedOutcomes(result.outcomes);
  return {
    succeeded: result.succeeded,
    failed: result.failed,
    errorLinks: errorOutcomeLinks(result.outcomes, item),
    reasonedSkips,
    allSkip:
      result.failed.length === 0 &&
      result.succeeded.length === 0 &&
      reasonedSkips.length > 0,
  };
}

/**
 * The CTA's settled state (plan 0031 U15, R14, KTD-14). `onList` is
 * `useIsWatchlisted(item)`: `true` → on a watchlist, `false` → not on one,
 * `undefined` → the surface has never been opened, which renders as today's
 * unsettled label and never as a claim of absence.
 *
 * The one thing the *report* still overrides is a **mixed** one: a write where
 * a provider failed keeps the CTA actionable even once the cache knows another
 * provider took it, because settling doubles as a retry lock and the failure
 * line below needs a button to retry from. Pure, so the rule is checkable
 * without a renderer — this app renders nothing in tests.
 */
export function isWatchlistCtaSettled(
  onList: boolean | undefined,
  view: Pick<WatchlistResultView, 'failed'> | null,
): boolean {
  return onList === true && (view?.failed.length ?? 0) === 0;
}

/**
 * Whether the sheet entry point may close itself on this report. Only a report
 * with nothing left to read: a failure, a reasoned skip and a manual row all
 * have to survive on screen, because the app has no toast and the user is
 * typically on search or the feed with no details screen mounted.
 */
export function isCleanWatchlistReport(result: WatchlistReportLike): boolean {
  const { reasonedSkips } = splitSkippedOutcomes(result.outcomes);
  return (
    result.succeeded.length > 0 &&
    result.failed.length === 0 &&
    reasonedSkips.length === 0 &&
    result.manual.length === 0
  );
}

/** "Already on Trakt, AniList." — the all-skip report's own headline. */
export function alreadyOnSentence(
  reasonedSkips: SkippedOutcomesSplit['reasonedSkips'],
): string {
  return `Already on ${providerLabelList(reasonedSkips.map((skip) => skip.provider))}.`;
}

/** "Added to Trakt, AniList." — the success headline. */
export function addedToSentence(succeeded: readonly ProviderId[]): string {
  return `Added to ${providerLabelList(succeeded)}.`;
}

/** "Removed from Trakt, AniList." — the removal's success headline. */
export function removedFromSentence(succeeded: readonly ProviderId[]): string {
  return `Removed from ${providerLabelList(succeeded)}.`;
}

/**
 * The removal CTA's settled state (plan 0031 U16, R35). Deliberately **not**
 * `isWatchlistCtaSettled` with the boolean flipped, because the removal has a
 * third input the add does not: whether every applicable provider's membership
 * was actually *known*.
 *
 * `onList` is `useIsWatchlisted(entry.item)` read the same cache-only way the
 * add reads it, so "Removed" appears when the refetch lands and the row leaves
 * the grid — never from an optimistic patch (KTD-5). `view` must exist at all,
 * so a cold cache can never render "Removed" for something nobody removed.
 *
 * `membershipUnknown` is R35's honesty clause and the reason this function
 * exists: `sources` records "providers whose read leg returned this item", so a
 * connected provider with no read leg (Serializd in v1, AniList for MANGA) or
 * one whose leg errored on this gather is **unknown**, not absent. Claiming
 * "Removed" while the film is still on the user's Trakt watchlist — because the
 * Trakt leg failed and the row was never seen — is exactly the false
 * completeness claim R14 forbids. Those providers get an upfront manual row
 * instead, and the label stays actionable.
 */
export function isUnwatchlistCtaSettled(
  onList: boolean | undefined,
  view: Pick<WatchlistResultView, 'failed'> | null,
  membershipUnknown: readonly ProviderId[],
): boolean {
  return (
    view != null &&
    view.failed.length === 0 &&
    membershipUnknown.length === 0 &&
    onList === false
  );
}

/** "Failed on Letterboxd." — the failure headline. */
export function failedOnSentence(failed: readonly ProviderId[]): string {
  return `Failed on ${providerLabelList(failed)}.`;
}
