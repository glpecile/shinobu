import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { cn } from '@/lib/cn';

export interface EmptyStateTileProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  cta?: { label: string; icon?: ReactNode; onPress: () => void };
  children?: ReactNode;
  className?: string;
}

export function EmptyStateTile({
  icon,
  title,
  description,
  cta,
  children,
  className,
}: EmptyStateTileProps) {
  return (
    <View className={cn('items-center justify-center px-8', className)}>
      {icon != null && <View className="mb-3">{icon}</View>}
      <Text className="font-display text-foreground text-center tracking-tight text-xl">
        {title}
      </Text>
      {description != null && (
        <Text className="font-sans text-muted text-center leading-relaxed text-sm mt-2 max-w-xs">
          {description}
        </Text>
      )}
      {children}
      {cta != null && (
        <Button
          className="mt-6"
          {...(cta.icon != null ? { icon: cta.icon } : {})}
          label={cta.label}
          onPress={cta.onPress}
          size="md"
        />
      )}
    </View>
  );
}
