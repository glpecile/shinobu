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
  /**
   * R14's settled condition, **PR A's truth source**: the mutation report.
   * U15 (PR C) replaces the whole expression with `useIsWatchlisted(item)` —
   * it is one expression behind one local precisely so that swap stays small.
   *
   * A mixed report (one `ok`, one `error`) deliberately does *not* settle: the
   * settled label asserts a completeness that would be false, and it doubles
   * as a retry lock on a write that still needs retrying.
   */
  settled: boolean;
}

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
    settled:
      result.failed.length === 0 &&
      (result.succeeded.length > 0 || reasonedSkips.length > 0),
  };
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

/** "Failed on Letterboxd." — the failure headline. */
export function failedOnSentence(failed: readonly ProviderId[]): string {
  return `Failed on ${providerLabelList(failed)}.`;
}
