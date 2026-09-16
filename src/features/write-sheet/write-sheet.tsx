import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { SectionEnter } from '@/components/section-enter';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import type { ProviderId } from '@/lib/providers/types';

import {
  WriteResultReport,
  type WriteResultReportProps,
} from './write-result-report';

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
  if (result == null) return null;
  return (
    <SectionEnter>
      {result.succeeded.length > 0 && (
        <Text className="text-muted font-sans text-sm mt-3">
          {succeededLine(result.succeeded)}
        </Text>
      )}
      <WriteResultReport outcomes={result.outcomes} {...report} />
    </SectionEnter>
  );
}

/** The thrown-write error, under the report. */
function WriteError({ children }: { children: ReactNode }) {
  return (
    <SectionEnter>
      <Text className="text-accent font-sans text-sm mt-3">{children}</Text>
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
export const WriteSheet = { Title, Description, Report, Error: WriteError, Actions, Cancel };
