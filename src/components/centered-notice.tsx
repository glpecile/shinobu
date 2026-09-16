import type { ComponentProps, ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { cn } from '@/lib/cn';

/**
 * Centered message with an optional action — a dedicated screen's
 * total-failure and empty states. A screen must never degrade to a blank page.
 *
 * ```tsx
 * <CenteredNotice>
 *   <CenteredNotice.Title>Something went wrong</CenteredNotice.Title>
 *   <CenteredNotice.Body>Check your connection and try again.</CenteredNotice.Body>
 *   <CenteredNotice.Action icon={<Button.Icon name="refresh" />} label="Try again" onPress={retry} />
 * </CenteredNotice>
 * ```
 */
export function CenteredNotice({
  className,
  children,
}: {
  /** Layout only. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <View className={cn('flex-1 items-center justify-center px-8', className)}>
      {children}
    </View>
  );
}

/** A kanji over the title, in the OS fallback font — neither app family ships kanji. */
function CenteredNoticeGlyph({ children }: { children: ReactNode }) {
  return <Text className="text-5xl text-muted mb-4">{children}</Text>;
}

function CenteredNoticeTitle({ children }: { children: ReactNode }) {
  return (
    <Text className="text-2xl font-display text-foreground text-center">{children}</Text>
  );
}

function CenteredNoticeBody({ children }: { children: ReactNode }) {
  return (
    <Text className="text-base font-sans text-muted mt-3 text-center max-w-xs leading-relaxed">
      {children}
    </Text>
  );
}

function CenteredNoticeAction(props: Omit<ComponentProps<typeof Button>, 'className'>) {
  return <Button {...props} className="mt-6" />;
}

CenteredNotice.Glyph = CenteredNoticeGlyph;
CenteredNotice.Title = CenteredNoticeTitle;
CenteredNotice.Body = CenteredNoticeBody;
CenteredNotice.Action = CenteredNoticeAction;
