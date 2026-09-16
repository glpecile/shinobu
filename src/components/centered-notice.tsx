import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { cn } from '@/lib/cn';

/**
 * Centered message with an optional action — a dedicated screen's
 * total-failure and empty states. A screen must never degrade to a blank page.
 */
export function CenteredNotice({
  glyph,
  title,
  body,
  actionLabel,
  actionIcon,
  onAction,
  className,
}: {
  /** A kanji over the title, in the OS fallback font — neither app family ships kanji. */
  glyph?: string;
  title: string;
  body: string;
  actionLabel?: string;
  /** A `<Button.Icon />` for the action — every button in the app carries one. */
  actionIcon?: ReactNode;
  onAction?: () => void;
  /** Layout only. */
  className?: string;
}) {
  return (
    <View className={cn('flex-1 items-center justify-center px-8', className)}>
      {glyph != null && <Text className="text-5xl text-muted mb-4">{glyph}</Text>}
      <Text className="text-2xl font-display text-foreground text-center">
        {title}
      </Text>
      <Text className="text-base font-sans text-muted mt-3 text-center max-w-xs leading-relaxed">
        {body}
      </Text>
      {actionLabel != null && onAction != null && (
        <Button
          className="mt-6"
          {...(actionIcon != null ? { icon: actionIcon } : {})}
          label={actionLabel}
          onPress={onAction}
        />
      )}
    </View>
  );
}
