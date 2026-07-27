import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

/**
 * Stand-in for missing artwork (posters, backdrops, studio logos): the 忍
 * mark centered on a surface tile, instead of a void-black box. The kanji
 * intentionally renders in the OS fallback font — neither app family ships
 * kanji (AGENTS.md "Theming").
 */
export function PosterPlaceholder({ className }: { className?: string }) {
  return (
    <View
      className={cn(
        'bg-surface border border-border/50 items-center justify-center',
        className,
      )}
    >
      <Text className="text-muted/50 font-sans text-4xl">忍</Text>
    </View>
  );
}
