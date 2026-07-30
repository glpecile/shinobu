import { Text, View } from 'react-native';

import {
  manualLinkForOutcome,
  splitSkippedOutcomes,
  type SkippedOutcomesSplit,
} from '@/features/log-media/manual-write-links';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import { OutcomeLink, type OutcomeLinkTone } from '@/features/log-media/outcome-link';
import type { UrlItem } from '@/lib/providers/external-urls';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

/**
 * One failure/skip message line, with a "{verb} {Provider}" external link
 * beneath it when the provider's item URL is buildable (plan 0022 R5/R6).
 */
function OutcomeMessage({
  outcome,
  message,
  item,
  verb,
  tone = 'accent',
}: {
  outcome: ProviderWriteOutcome;
  message: string;
  item: UrlItem;
  verb?: string;
  tone?: OutcomeLinkTone;
}) {
  const link = manualLinkForOutcome(outcome, item);
  return (
    <View>
      <Text className="text-muted font-sans text-xs">{message}</Text>
      {link != null && (
        <OutcomeLink
          provider={outcome.provider}
          tone={tone}
          url={link}
          {...(verb != null ? { verb } : {})}
        />
      )}
    </View>
  );
}

export interface WriteResultReportProps {
  outcomes: readonly ProviderWriteOutcome[];
  /** The item written — needed to build the per-outcome provider links (plan 0022). */
  item: UrlItem;
  /** `OutcomeLink` wording — 'Log on' (default) / 'Add on' / 'Remove on'. */
  verb?: string;
  /** "Failed on Letterboxd — Trakt was logged." — the caller owns the copy. */
  failedHeadline: (
    failed: readonly ProviderId[],
    succeeded: readonly ProviderId[],
  ) => string;
  /** The reconcile-skip line ("already had this logged"); omitted → not rendered. */
  reconcileLine?: (skipped: readonly ProviderId[]) => string;
  /**
   * The all-skip headline (plan 0031 U8): every applicable provider reported an
   * already-there skip — the most common repeat interaction, which would
   * otherwise render as a list of footnotes with no sentence.
   */
  allSkipLine?: (skips: SkippedOutcomesSplit['reasonedSkips']) => string;
}

/**
 * The result families every write verb reports through (plan 0032 U2, KTD-1) —
 * moved from `LogConfirmSheet`, composed by it and by the watchlist picker
 * sheet, never re-derived per verb. The rules a second copy would drift on:
 *
 * - reconcile skips (no reason — already in sync) and adapter-reported skips
 *   (a reason) render differently, never lumped (plan 0022 R6);
 * - every error renders its message *and* a manual link when buildable —
 *   `manualLinkForOutcome` has no home-URL fallback, unlike the upfront rows;
 * - reasoned skips are individual lines: "already on your watchlist" and
 *   "S1–S2 are already watched" are different facts.
 */
export function WriteResultReport({
  outcomes,
  item,
  verb,
  failedHeadline,
  reconcileLine,
  allSkipLine,
}: WriteResultReportProps) {
  const failed = outcomes.filter((outcome) => outcome.status === 'error');
  const succeeded = outcomes
    .filter((outcome) => outcome.status === 'ok')
    .map((outcome) => outcome.provider);
  const { reconcileSkipped, reasonedSkips } = splitSkippedOutcomes(outcomes);
  const allSkip =
    failed.length === 0 && succeeded.length === 0 && reasonedSkips.length > 0;

  return (
    <>
      {failed.length > 0 && (
        <View className="mt-3 gap-1">
          <Text className="text-accent font-sans text-sm">
            {failedHeadline(
              failed.map((outcome) => outcome.provider),
              succeeded,
            )}
          </Text>
          {/* The per-provider reason (e.g. Letterboxd film not found, session
              expired) — without it every failure looks identical (plan 0012). */}
          {failed.map((outcome) => (
            <OutcomeMessage
              item={item}
              key={outcome.provider}
              message={outcome.message}
              outcome={outcome}
              {...(verb != null ? { verb } : {})}
            />
          ))}
        </View>
      )}
      {allSkip && allSkipLine != null && (
        <Text className="text-muted font-sans text-sm mt-3">
          {allSkipLine(reasonedSkips)}
        </Text>
      )}
      {reconcileSkipped.length > 0 && reconcileLine != null && (
        <Text className="text-muted font-sans text-sm mt-3">
          {reconcileLine(reconcileSkipped)}
        </Text>
      )}
      {reasonedSkips.length > 0 && (
        <View className="mt-3 gap-1">
          {reasonedSkips.map((outcome) => (
            <OutcomeMessage
              item={item}
              key={outcome.provider}
              message={`${PROVIDERS[outcome.provider].label}: ${outcome.reason}`}
              tone="neutral"
              outcome={outcome}
              {...(verb != null ? { verb } : {})}
            />
          ))}
        </View>
      )}
    </>
  );
}
