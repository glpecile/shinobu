import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { FadeIn } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Button } from '@/components/button';
import { ProviderIcon } from '@/components/provider-icon';
import { SectionEnter } from '@/components/section-enter';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import { DURATION } from '@/lib/motion';
import type { ProviderId } from '@/lib/providers/types';
import { useThemeColor } from '@/lib/theme-color';

import {
  WriteResultReport,
  type WriteResultReportProps,
} from './write-result-report';

/**
 * The drawer's view swap. The sheet shows **one view at a time** — the form,
 * or the report — and a change of `key` crossfades the new view in while the
 * sheet's own height animates under it (native: the `'content'` detent; web:
 * the panel's height transition).
 *
 * A preset, not a custom `Keyframe`: the entering view has to contribute its
 * height to the sheet's flow, and a `Keyframe`'s web cleanup pins the element
 * out of it (docs/solutions/reanimated-web-keyframe-pins-position.md). No
 * `exiting` either — an exiting view keeps its layout space on native, so the
 * sheet would briefly measure both views stacked and lurch to the sum.
 */
const stepEntering = FadeIn.duration(DURATION.swap);

function Step({ children }: { children: ReactNode }) {
  return <AnimatedView entering={stepEntering}>{children}</AnimatedView>;
}

function Title({ children }: { children: ReactNode }) {
  return <Text className="text-2xl font-display text-foreground">{children}</Text>;
}

function Description({ children }: { children: ReactNode }) {
  return (
    <Text className="text-muted font-sans text-sm mt-2 leading-relaxed">
      {children}
    </Text>
  );
}

/**
 * A settled write, kept on the sheet: what landed and the per-provider report
 * (reasons and manual links). Renders nothing until a result exists.
 */
function Report({
  result,
  succeededLine,
  ...report
}: Omit<WriteResultReportProps, 'outcomes'> & {
  result:
    | { outcomes: readonly ProviderWriteOutcome[]; succeeded: readonly ProviderId[] }
    | undefined;
  succeededLine: (succeeded: readonly ProviderId[]) => string;
}) {
  const success = useThemeColor('--color-success');
  if (result == null) return null;
  return (
    <SectionEnter>
      {result.succeeded.length > 0 && (
        <View className="mt-3 gap-2">
          <View className="flex-row items-start gap-2">
            <Ionicons
              accessibilityElementsHidden
              importantForAccessibility="no"
              color={success}
              name="checkmark-circle"
              size={20}
            />
            <Text className="text-foreground font-sans text-sm flex-1">
              {succeededLine(result.succeeded)}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            {result.succeeded.map((id) => (
              <ProviderIcon id={id} key={id} size={18} />
            ))}
          </View>
        </View>
      )}
      <WriteResultReport outcomes={result.outcomes} {...report} />
    </SectionEnter>
  );
}

/** The thrown-write error, under the report. */
function WriteError({ children }: { children: ReactNode }) {
  const accent = useThemeColor('--color-accent-on-tonal');
  return (
    <SectionEnter>
      <View className="flex-row items-start gap-2 mt-3 rounded-lg bg-accent-tonal p-3">
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          color={accent}
          name="alert-circle"
          size={20}
        />
        <Text className="text-accent-on-tonal font-sans text-sm flex-1">
          {children}
        </Text>
      </View>
    </SectionEnter>
  );
}

/** The confirm/dismiss stack at the foot of the sheet. */
function Actions({ children }: { children: ReactNode }) {
  return <View className="mt-6 gap-2">{children}</View>;
}

function Cancel({ onPress }: { onPress: () => void }) {
  return (
    <Button
      icon={<Button.Icon name="close" />}
      label="Cancel"
      onPress={onPress}
      variant="quiet"
    />
  );
}

/**
 * The write verbs' sheet body (log, watchlist add/remove, catch-up), composed
 * around each verb's own fields and confirm button.
 */
export const WriteSheet = { Step, Title, Description, Report, Error: WriteError, Actions, Cancel };
