import { useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { MorphText } from '@/components/morph-text';
import { PresstableOpacity } from '@/components/presstable';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';

/** `text-base` (16) × `leading-relaxed` (1.625) — keep in sync with the class. */
const LINE_HEIGHT = 26;

/**
 * The box owns the clamp so opening is one height transition. Browsers lay the
 * paragraph out in full and let it overflow the box, which is what makes the
 * measurement honest here and not on native (see index.tsx).
 */
export function ExpandableText({ text, lines = 2 }: { text: string; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const reduceMotion = useReducedMotion();
  const collapsed =
    fullHeight === 0 ? lines * LINE_HEIGHT : Math.min(lines * LINE_HEIGHT, fullHeight);

  return (
    <View className="mb-6">
      <AnimatedView
        className="overflow-hidden"
        style={{
          height: expanded ? fullHeight : collapsed,
          ...(reduceMotion
            ? null
            : {
                transitionProperty: 'height',
                transitionDuration: DURATION.toggle,
                transitionTimingFunction: EASE_IN_OUT,
              }),
        }}
      >
        <Text
          className="text-foreground/90 font-sans text-base leading-relaxed"
          onLayout={(event) => setFullHeight(event.nativeEvent.layout.height)}
        >
          {text}
        </Text>
      </AnimatedView>
      {fullHeight > collapsed + 1 && (
        <PresstableOpacity className="self-start mt-1.5" onPress={() => setExpanded(!expanded)}>
          {/* `self-start`: the morph span shrink-wraps, and without it the
              pressable collapses to a 1px hit target. */}
          <MorphText className="text-accent font-sans-semibold text-sm self-start">
            {expanded ? 'Read less' : 'Read more'}
          </MorphText>
        </PresstableOpacity>
      )}
    </View>
  );
}
