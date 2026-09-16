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

function Header({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <Text className="text-2xl font-display text-foreground">{title}</Text>
      {description != null && (
        <Text className="text-muted font-sans text-sm mt-2 leading-relaxed">
          {description}
        </Text>
      )}
    </>
  );
}

/**
 * A settled write, kept on the sheet: what landed, the per-provider report
 * (reasons and manual links), and the thrown-write error. Renders nothing
 * until one of them exists.
 */
function Report({
  result,
  succeededLine,
  error,
  ...report
}: Omit<WriteResultReportProps, 'outcomes'> & {
  result:
    | { outcomes: readonly ProviderWriteOutcome[]; succeeded: readonly ProviderId[] }
    | undefined;
  succeededLine: (succeeded: readonly ProviderId[]) => string;
  error: string | null;
}) {
  if (result == null && error == null) return null;
  return (
    <SectionEnter>
      {result != null && result.succeeded.length > 0 && (
        <Text className="text-muted font-sans text-sm mt-3">
          {succeededLine(result.succeeded)}
        </Text>
      )}
      {result != null && (
        <WriteResultReport outcomes={result.outcomes} {...report} />
      )}
      {error != null && (
        <Text className="text-accent font-sans text-sm mt-3">{error}</Text>
      )}
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
export const WriteSheet = { Header, Report, Actions, Cancel };
