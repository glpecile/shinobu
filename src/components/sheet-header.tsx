import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Eyebrow } from '@/components/eyebrow';
import { Sheet } from '@/components/sheet';

export function SheetHeader({ children }: { children: ReactNode }) {
  return (
    <Sheet.Header>
      <View className="flex-row items-center gap-4">{children}</View>
    </Sheet.Header>
  );
}

function Content({ children }: { children: ReactNode }) {
  return <View className="flex-1">{children}</View>;
}

function SheetEyebrow({ tone = 'accent', children }: { tone?: 'muted' | 'accent'; children: ReactNode }) {
  return <Eyebrow tone={tone}>{children}</Eyebrow>;
}

function Title({ children, numberOfLines = 3 }: { children: ReactNode; numberOfLines?: number }) {
  return (
    <Text className="text-2xl font-display text-foreground" numberOfLines={numberOfLines}>
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
