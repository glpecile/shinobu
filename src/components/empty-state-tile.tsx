import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { cn } from '@/lib/cn';

/**
 * The shared empty-state tile — icon + headline + optional body + optional CTA
 * (plan 0016 R9), sized for embedding inside a list (the diary's connect /
 * degraded / no-logs states). Theme tokens only.
 */
export interface EmptyStateTileProps {
  /** Rendered above the headline (a provider glyph, an Ionicon, the 忍 mark). */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** `icon` is a `<Button.Icon />` — every button in the app carries one. */
  cta?: { label: string; icon?: ReactNode; onPress: () => void };
  /** Extra content between the description and the CTA (e.g. an error line). */
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
      <Text
        className="font-display text-foreground text-center tracking-tight text-xl"
      >
        {title}
      </Text>
      {description != null && (
        <Text
          className="font-sans text-muted text-center leading-relaxed text-sm mt-2 max-w-xs"
        >
          {description}
        </Text>
      )}
      {children}
      {cta != null && (
        // Margin only: padding here lands on the pressable around the drawn
        // box and steals width from the label. Size owns the padding.
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
