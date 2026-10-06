import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';

import { ProviderIcon } from '@/components/provider-icon';
import {
  manualLinkForOutcome,
  okReasonOutcomes,
  splitSkippedOutcomes,
} from '@/features/log-media/manual-write-links';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import { OutcomeLink, type OutcomeLinkTone } from '@/features/log-media/outcome-link';
import { cn } from '@/lib/cn';
import type { UrlItem } from '@/lib/providers/external-urls';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useThemeColor } from '@/lib/theme-color';

/**
 * Provider-labelled result card, with a manual link when the item URL is
 * buildable. Errors use a tonal surface; skips remain neutral because a
 * deliberate skip is not a failed request.
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
  const accent = useThemeColor('--color-accent-on-tonal');
  const muted = useThemeColor('--color-muted');
  const success = useThemeColor('--color-success');
  const failed = outcome.status === 'error';
  const saved = outcome.status === 'ok';
  return (
    <View
      className={cn(
        'rounded-lg border p-3 gap-2',
        failed ? 'border-accent/30 bg-accent-tonal' : 'border-border bg-background',
      )}
    >
      <View className="flex-row items-center gap-2">
        <ProviderIcon id={outcome.provider} />
        <Text className="text-foreground font-sans-semibold text-sm flex-1">
          {PROVIDERS[outcome.provider].label}
        </Text>
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          color={failed ? accent : saved ? success : muted}
          name={failed ? 'alert-circle' : saved ? 'checkmark-circle' : 'remove-circle-outline'}
          size={18}
        />
        <Text
          className={cn(
            'font-sans-semibold text-xs',
            failed ? 'text-accent-on-tonal' : 'text-muted',
          )}
        >
          {failed ? 'Failed' : saved ? 'Saved' : 'Not saved'}
        </Text>
      </View>
      <Text
        className={cn(
          'font-sans text-sm leading-relaxed',
          failed ? 'text-accent-on-tonal' : 'text-muted',
        )}
      >
        {message}
      </Text>
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
  /** "Failed on Letterboxd — Trakt was logged." — the caller owns the copy; omitted → the reasons stand alone. */
  failedHeadline?: (
    failed: readonly ProviderId[],
    succeeded: readonly ProviderId[],
  ) => string;
  /** The reconcile-skip line ("already had this logged"); omitted → not rendered. */
  reconcileLine?: (skipped: readonly ProviderId[]) => string;
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
}: WriteResultReportProps) {
  const failed = outcomes.filter((outcome) => outcome.status === 'error');
  const succeeded = outcomes
    .filter((outcome) => outcome.status === 'ok')
    .map((outcome) => outcome.provider);
  const { reconcileSkipped, reasonedSkips } = splitSkippedOutcomes(outcomes);
  const okReasons = okReasonOutcomes(outcomes);

  return (
    <>
      {failed.length > 0 && (
        <View className="mt-3 gap-2">
          {failedHeadline != null && (
            <Text className="text-accent font-sans text-sm">
              {failedHeadline(
                failed.map((outcome) => outcome.provider),
                succeeded,
              )}
            </Text>
          )}
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
      {reconcileSkipped.length > 0 && reconcileLine != null && (
        <Text className="text-muted font-sans text-sm mt-3">
          {reconcileLine(reconcileSkipped)}
        </Text>
      )}
      {(okReasons.length > 0 || reasonedSkips.length > 0) && (
        <View className="mt-3 gap-2">
          {/* Partial successes (an `ok` carrying a reason — plan 0031 R16,
              Serializd's season-filtered add) share the reasoned-skip family:
              same neutral tone, because "S1 is already watched" is a fact,
              not something that went wrong. `manualLinkForOutcome` builds no
              link for an ok, so the line stands alone. */}
          {okReasons.map((outcome) => (
            <OutcomeMessage
              item={item}
              key={`ok-${outcome.provider}`}
              message={outcome.reason}
              tone="neutral"
              outcome={outcome}
              {...(verb != null ? { verb } : {})}
            />
          ))}
          {reasonedSkips.map((outcome) => (
            <OutcomeMessage
              item={item}
              key={outcome.provider}
              message={outcome.reason}
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
