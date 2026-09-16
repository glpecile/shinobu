import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

/**
 * A titled page section. `className` is layout only.
 *
 * ```tsx
 * <Section>
 *   <Section.Header>
 *     <Section.Title>Filmography</Section.Title>
 *     <Section.Count>208 titles</Section.Count>
 *   </Section.Header>
 *   {children}
 * </Section>
 * ```
 */
export function Section({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <View className={cn('mt-8', className)}>{children}</View>;
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row flex-wrap items-baseline gap-x-2 mb-4">{children}</View>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <Text className="font-display text-xl text-foreground">{children}</Text>;
}

function SectionCount({ children }: { children: ReactNode }) {
  return <Text className="text-muted font-sans text-xs">{children}</Text>;
}

function SectionSubtitle({ children }: { children: ReactNode }) {
  return (
    <Text className="text-muted font-sans text-sm mt-1 basis-full">{children}</Text>
  );
}

Section.Header = SectionHeader;
Section.Title = SectionTitle;
Section.Count = SectionCount;
Section.Subtitle = SectionSubtitle;
