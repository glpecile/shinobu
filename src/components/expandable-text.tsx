import { useState } from 'react';
import { LayoutAnimation, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { MorphText } from '@/components/morph-text';
import { PresstableOpacity } from '@/components/presstable';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';

const WEB = process.env.EXPO_OS === 'web';

/** `text-base` (16) × `leading-relaxed` (1.625) — keep in sync with the class. */
const LINE_HEIGHT = 26;

/**
 * Native reflows everything below the paragraph as it opens; one CoreAnimation
 * pass over the layout diff beats a Reanimated layout commit per frame.
 */
const DISCLOSURE_LAYOUT = LayoutAnimation.create(
  DURATION.toggle,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

/**
 * Body text clipped to `lines` with a Read more toggle. The box owns the clamp
 * rather than `numberOfLines`, so opening is one height change and the text
 * under it is never re-laid out; `lines × LINE_HEIGHT` is the closed height,
 * and the text's own layout is the open one.
 */
export function ExpandableText({ text, lines = 2 }: { text: string; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const reduceMotion = useReducedMotion();
  // Clipped from the first frame, before any measurement: a paragraph that
  // paints full height and then collapses is worse than one that grows.
  const collapsed =
    fullHeight === 0 ? lines * LINE_HEIGHT : Math.min(lines * LINE_HEIGHT, fullHeight);

  function toggle() {
    if (!WEB && !reduceMotion) LayoutAnimation.configureNext(DISCLOSURE_LAYOUT);
    setExpanded(!expanded);
  }

  return (
    <View className="mb-6">
      <AnimatedView
        className="overflow-hidden"
        style={{
          height: expanded ? fullHeight : collapsed,
          ...(WEB && !reduceMotion
            ? {
                transitionProperty: 'height',
                transitionDuration: DURATION.toggle,
                transitionTimingFunction: EASE_IN_OUT,
              }
            : null),
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
