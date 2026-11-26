import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

export function PosterPlaceholder({ className }: { className?: string }) {
  return (
    <View
      className={cn('bg-surface border border-border/50 items-center justify-center', className)}
    >
      <Text className="text-muted/50 font-sans text-4xl">忍</Text>
    </View>
  );
}
