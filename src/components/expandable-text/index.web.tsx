import { useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PressableCard } from '@/components/pressable-card';
import { cn } from '@/lib/cn';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';

import { ExpandableTextSkeleton } from './skeleton';
import { LinkedText } from './linked-text';

/** `text-base` (16) × `leading-relaxed` (1.625) — keep in sync with the class. */
const LINE_HEIGHT = 26;

/**
 * A titled overview box; the whole card toggles between clamped and full text.
 * The box owns the clamp so opening is one height transition. Browsers lay the
 * paragraph out in full and let it overflow the box, which is what makes the
 * measurement honest here and not on native (see index.tsx).
 */
export function ExpandableText({
  text,
  linkedText,
  title = 'Overview',
  lines = 2,
  className,
}: {
  text: string;
  linkedText?: string;
  title?: string;
  lines?: number;
  /** Layout only. */
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const reduceMotion = useReducedMotion();
  const collapsed =
    fullHeight === 0
      ? lines * LINE_HEIGHT
      : Math.min(lines * LINE_HEIGHT, fullHeight);
  const expandable = fullHeight > collapsed + 1;

  return (
    <PressableCard
      accessibilityState={{ expanded }}
      className={cn('mb-6', className)}
      disabled={!expandable}
      onPress={() => setExpanded(!expanded)}
    >
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-foreground font-sans-semibold text-base">
          {title}
        </Text>
        {expandable && <DisclosureChevron open={expanded} size={18} />}
      </View>
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
          {linkedText == null ? text : <LinkedText text={linkedText} />}
        </Text>
      </AnimatedView>
    </PressableCard>
  );
}

ExpandableText.Skeleton = ExpandableTextSkeleton;
