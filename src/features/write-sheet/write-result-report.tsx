import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View } from 'react-native';

import { ProviderIcon } from '@/components/provider-icon';
import {
  manualLinkForOutcome,
  okReasonOutcomes,
  splitSkippedOutcomes,
} from '@/features/log-media/manual-write-links';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import { OutcomeLink } from '@/features/log-media/outcome-link';
import { cn } from '@/lib/cn';
import type { UrlItem } from '@/lib/providers/external-urls';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { useThemeColor } from '@/lib/theme-color';

function OutcomeMessage({
  outcome,
  message,
  item,
  verb,
}: {
  outcome: ProviderWriteOutcome;
  message: string;
  item: UrlItem;
  verb?: string;
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
          tone={failed ? 'accent' : 'neutral'}
          url={link}
          {...(verb != null ? { verb } : {})}
        />
      )}
    </View>
  );
}

export interface WriteResultReportProps {
  outcomes: readonly ProviderWriteOutcome[];
  item: UrlItem;
  verb?: string;
  failedHeadline?: (failed: readonly ProviderId[], succeeded: readonly ProviderId[]) => string;
  reconcileLine?: (skipped: readonly ProviderId[]) => string;
}

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
  const queued = outcomes
    .filter((outcome) => outcome.status === 'queued')
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
      {queued.length > 0 && (
        <Text className="text-muted font-sans text-sm mt-3">
          {`Saved offline. Logs to ${queued.map((id) => PROVIDERS[id].label).join(', ')} when you are back online.`}
        </Text>
      )}
      {reconcileSkipped.length > 0 && reconcileLine != null && (
        <Text className="text-muted font-sans text-sm mt-3">{reconcileLine(reconcileSkipped)}</Text>
      )}
      {(okReasons.length > 0 || reasonedSkips.length > 0) && (
        <View className="mt-3 gap-2">
          {okReasons.map((outcome) => (
            <OutcomeMessage
              item={item}
              key={`ok-${outcome.provider}`}
              message={outcome.reason}
              outcome={outcome}
              {...(verb != null ? { verb } : {})}
            />
          ))}
          {reasonedSkips.map((outcome) => (
            <OutcomeMessage
              item={item}
              key={outcome.provider}
              message={outcome.reason}
              outcome={outcome}
              {...(verb != null ? { verb } : {})}
            />
          ))}
        </View>
      )}
    </>
  );
}
