import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { SectionEnter } from '@/components/section-enter';
import { Sheet } from '@/components/sheet';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import { DURATION, EASE_OUT } from '@/lib/motion';
import type { ProviderId } from '@/lib/providers/types';
import { useThemeColor } from '@/lib/theme-color';

import { WriteResultReport, type WriteResultReportProps } from './write-result-report';

// CSS animation, not an `entering` layout animation: Android's keyboard resizes
// the sheet host and can leave a `FadeIn` stuck at opacity 0. No `exiting` either:
// an exiting view keeps its layout space on native, making the sheet measure both views.
const stepFade = { from: { opacity: 0 }, to: { opacity: 1 } };

function Step({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <AnimatedView
      style={{
        opacity: 0,
        animationName: stepFade,
        animationDuration: reducedMotion ? 1 : DURATION.swap,
        animationTimingFunction: EASE_OUT,
        animationFillMode: 'both',
      }}
    >
      {children}
    </AnimatedView>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <Text className="text-2xl font-display text-foreground">{children}</Text>;
}

function Description({ children }: { children: ReactNode }) {
  return <Text className="text-muted font-sans text-sm mt-2 leading-relaxed">{children}</Text>;
}

function Report({
  result,
  succeededLine,
  ...report
}: Omit<WriteResultReportProps, 'outcomes'> & {
  result:
    { outcomes: readonly ProviderWriteOutcome[]; succeeded: readonly ProviderId[] } | undefined;
  succeededLine: (succeeded: readonly ProviderId[]) => string;
}) {
  const success = useThemeColor('--color-success');
  if (result == null) return null;
  return (
    <SectionEnter>
      {result.succeeded.length > 0 && (
        <View className="mt-3 flex-row items-start gap-2 rounded-lg border border-border bg-background p-3">
          <Ionicons
            accessibilityElementsHidden
            importantForAccessibility="no"
            color={success}
            name="checkmark-circle"
            size={20}
          />
          <Text className="text-foreground font-sans text-sm leading-relaxed flex-1">
            {succeededLine(result.succeeded)}
          </Text>
        </View>
      )}
      <WriteResultReport outcomes={result.outcomes} {...report} />
    </SectionEnter>
  );
}

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
        <Text className="text-accent-on-tonal font-sans text-sm flex-1" role="alert">
          {children}
        </Text>
      </View>
    </SectionEnter>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <View className="mt-6 gap-2">{children}</View>;
}

export const WriteSheet = {
  Step,
  Header: Sheet.Header,
  Title,
  Description,
  Report,
  Error: WriteError,
  Actions,
};
