import { useState } from 'react';
import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';

/**
 * Body text clamped to `lines` with a Read more toggle (details overview,
 * person biography). Whether the text actually overflows depends on viewport
 * width and font metrics, so it's measured, not guessed: an invisible
 * unclamped copy of the text lays out alongside the clamped one, and the
 * toggle renders only when the full height exceeds the clamped height.
 */
export function ExpandableText({ text, lines = 2 }: { text: string; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [clampedHeight, setClampedHeight] = useState(0);
  const [fullHeight, setFullHeight] = useState(0);
  const clampable = fullHeight > clampedHeight + 1;

  return (
    <View className="mb-6">
      <Text
        className="text-foreground/90 font-sans text-base leading-relaxed"
        {...(expanded ? {} : { numberOfLines: lines })}
        onLayout={(event) => {
          // While expanded the visible text is the full text — measuring it
          // would erase the clamped baseline and hide the "Read less" toggle.
          if (!expanded) setClampedHeight(event.nativeEvent.layout.height);
        }}
      >
        {text}
      </Text>
      <Text
        aria-hidden
        className="text-foreground/90 font-sans text-base leading-relaxed absolute top-0 left-0 right-0 opacity-0"
        onLayout={(event) => setFullHeight(event.nativeEvent.layout.height)}
        pointerEvents="none"
      >
        {text}
      </Text>
      {clampable && (
        <PresstableOpacity
          className="self-start mt-1.5"
          onPress={() => setExpanded(!expanded)}
        >
          <Text className="text-accent font-sans-semibold text-sm">
            {expanded ? 'Read less' : 'Read more'}
          </Text>
        </PresstableOpacity>
      )}
    </View>
  );
}
