import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { MorphText } from '@/components/morph-text';
import { PresstableOpacity } from '@/components/presstable';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';

/**
 * Body text clamped to `lines` with a Read more toggle. Whether the text
 * overflows depends on viewport width and font metrics, so it's measured: an
 * invisible unclamped copy lays out alongside the clamped one, and the toggle
 * renders only when the full height exceeds the clamped height. Those same two
 * numbers are what the box transitions between when it opens.
 */
export function ExpandableText({ text, lines = 2 }: { text: string; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  // Lags `expanded` on the way down by the transition: re-clamping on press
  // would snap the paragraph to two lines under a box still closing over it.
  const [clamped, setClamped] = useState(true);
  const [clampedHeight, setClampedHeight] = useState(0);
  const [fullHeight, setFullHeight] = useState(0);
  const reduceMotion = useReducedMotion();
  const clampable = fullHeight > clampedHeight + 1;
  const reclampTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (reclampTimer.current != null) clearTimeout(reclampTimer.current);
    },
    [],
  );

  function toggle() {
    if (reclampTimer.current != null) clearTimeout(reclampTimer.current);
    if (expanded) {
      setExpanded(false);
      reclampTimer.current = setTimeout(() => setClamped(true), DURATION.toggle);
      return;
    }
    setClamped(false);
    setExpanded(true);
  }

  return (
    <View className="mb-6">
      <AnimatedView
        className="overflow-hidden"
        style={
          clampable && clampedHeight > 0
            ? {
                height: expanded ? fullHeight : clampedHeight,
                transitionProperty: 'height',
                transitionDuration: reduceMotion ? 0 : DURATION.toggle,
                transitionTimingFunction: EASE_IN_OUT,
              }
            : undefined
        }
      >
        <Text
          className="text-foreground/90 font-sans text-base leading-relaxed"
          {...(clamped ? { numberOfLines: lines } : {})}
          onLayout={(event) => {
            // Measuring while unclamped would erase the clamped baseline.
            if (clamped) setClampedHeight(event.nativeEvent.layout.height);
          }}
        >
          {text}
        </Text>
      </AnimatedView>
      <Text
        aria-hidden
        className="text-foreground/90 font-sans text-base leading-relaxed absolute top-0 left-0 right-0 opacity-0"
        onLayout={(event) => setFullHeight(event.nativeEvent.layout.height)}
        style={{ pointerEvents: 'none' }}
      >
        {text}
      </Text>
      {clampable && (
        <PresstableOpacity className="self-start mt-1.5" onPress={toggle}>
          {/* `self-start`: the morph span shrink-wraps on web, and without it
              the pressable collapses to a 1px hit target. */}
          <MorphText className="text-accent font-sans-semibold text-sm self-start">
            {expanded ? 'Read less' : 'Read more'}
          </MorphText>
        </PresstableOpacity>
      )}
    </View>
  );
}
