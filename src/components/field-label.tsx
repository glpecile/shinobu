import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { cn } from '@/lib/cn';

export function FieldLabel({
  className,
  onPress,
  children,
}: {
  className?: string;
  onPress?: () => void;
  children: ReactNode;
}) {
  return (
    <Text className={cn('text-foreground font-sans-semibold text-sm', className)} onPress={onPress}>
      {children}
    </Text>
  );
}
