import { Text, View } from 'react-native';

import { Button } from '@/components/button';

/**
 * Centered message with an optional action — a dedicated screen's
 * total-failure and empty states. A screen must never degrade to a blank page.
 */
export function CenteredNotice({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-2xl font-display text-foreground text-center">
        {title}
      </Text>
      <Text className="text-base font-sans text-muted mt-3 text-center max-w-xs leading-relaxed">
        {body}
      </Text>
      {actionLabel != null && onAction != null && (
        <Button className="mt-6" label={actionLabel} onPress={onAction} />
      )}
    </View>
  );
}
