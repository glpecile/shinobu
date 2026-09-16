import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Eyebrow } from '@/components/eyebrow';

/**
 * What a long-press sheet is about: artwork beside `SheetHeader.Content`. The
 * title wraps past the clamp that made the sheet worth opening.
 *
 * ```tsx
 * <SheetHeader>
 *   <SheetPoster item={item} />
 *   <SheetHeader.Content>
 *     <SheetHeader.Eyebrow>S01E02</SheetHeader.Eyebrow>
 *     <SheetHeader.Title>{title}</SheetHeader.Title>
 *     <SheetHeader.Subtitle>{meta}</SheetHeader.Subtitle>
 *   </SheetHeader.Content>
 * </SheetHeader>
 * ```
 */
export function SheetHeader({ children }: { children: ReactNode }) {
  return <View className="flex-row items-center gap-4">{children}</View>;
}

function Content({ children }: { children: ReactNode }) {
  return <View className="flex-1">{children}</View>;
}

function SheetEyebrow({ children }: { children: ReactNode }) {
  return <Eyebrow tone="accent">{children}</Eyebrow>;
}

function Title({ children }: { children: ReactNode }) {
  return (
    <Text className="text-2xl font-display text-foreground" numberOfLines={3}>
      {children}
    </Text>
  );
}

function Subtitle({ children }: { children: ReactNode }) {
  return <Text className="text-muted font-sans text-sm mt-1">{children}</Text>;
}

SheetHeader.Content = Content;
SheetHeader.Eyebrow = SheetEyebrow;
SheetHeader.Title = Title;
SheetHeader.Subtitle = Subtitle;
