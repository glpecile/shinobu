import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ComponentProps, ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';

export function CenteredNotice({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <View className={cn('flex-1 items-center justify-center px-8', className)}>{children}</View>
  );
}

function CenteredNoticeGlyph({ children }: { children: ReactNode }) {
  return (
    <Text
      accessibilityElementsHidden
      aria-hidden
      className="text-5xl text-muted mb-4"
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </Text>
  );
}

function CenteredNoticeIcon({ name }: { name: ComponentProps<typeof Ionicons>['name'] }) {
  const muted = useThemeColor('--color-muted');
  return (
    <View
      accessibilityElementsHidden
      aria-hidden
      className="mb-4"
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons color={muted} name={name} size={44} />
    </View>
  );
}

function CenteredNoticeTitle({ children }: { children: ReactNode }) {
  return (
    <Text
      accessibilityRole="header"
      className="text-2xl font-display text-foreground text-center max-w-full web:wrap-anywhere"
    >
      {children}
    </Text>
  );
}

function CenteredNoticeBody({ children }: { children: ReactNode }) {
  return (
    <Text className="text-base font-sans text-muted mt-3 text-center w-full max-w-xs leading-relaxed web:wrap-anywhere">
      {children}
    </Text>
  );
}

function CenteredNoticeAction(props: Omit<ComponentProps<typeof Button>, 'className'>) {
  return <Button {...props} className="mt-6" />;
}

function CenteredNoticeActions({ children }: { children: ReactNode }) {
  return <View className="mt-6 flex-row flex-wrap justify-center gap-3">{children}</View>;
}

CenteredNotice.Glyph = CenteredNoticeGlyph;
CenteredNotice.Icon = CenteredNoticeIcon;
CenteredNotice.Title = CenteredNoticeTitle;
CenteredNotice.Body = CenteredNoticeBody;
CenteredNotice.Action = CenteredNoticeAction;
CenteredNotice.Actions = CenteredNoticeActions;
