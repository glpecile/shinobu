import { useState } from 'react';
import { LayoutAnimation, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PressableCard } from '@/components/pressable-card';
import { cn } from '@/lib/cn';
import { DISCLOSURE_LAYOUT } from '@/lib/motion';

import { ExpandableTextSkeleton } from './skeleton';

const BODY = 'text-foreground/90 font-sans text-base leading-relaxed';

/** A titled overview box; the whole card toggles between clamped and full text. */
export function ExpandableText({
  text,
  title = 'Overview',
  lines = 2,
  className,
}: {
  text: string;
  title?: string;
  lines?: number;
  /** Layout only. */
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fullLines, setFullLines] = useState(0);
  const reduceMotion = useReducedMotion();
  const expandable = fullLines > lines;

  function toggle() {
    if (!reduceMotion) LayoutAnimation.configureNext(DISCLOSURE_LAYOUT);
    setExpanded(!expanded);
  }

  return (
    <PressableCard
      accessibilityState={{ expanded }}
      className={cn('mb-6', className)}
      disabled={!expandable}
      onPress={toggle}
    >
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-foreground font-sans-semibold text-base">
          {title}
        </Text>
        {expandable && <DisclosureChevron open={expanded} size={18} />}
      </View>
      {/* Both paragraphs share this box so the hidden one measures at the
        clamped one's width (an absolute child ignores the card's padding). */}
      <View>
        <Text className={BODY} numberOfLines={expanded ? undefined : lines}>
          {text}
        </Text>
        {/* iOS lays a paragraph out to fit whatever box it's in, so the clamped
          copy can't say how long the text really is. This one is unconstrained,
          and it's the only thing that knows whether there's more to read. */}
        <View
          accessibilityElementsHidden
          className="absolute left-0 right-0 opacity-0"
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <Text
            className={BODY}
            onTextLayout={(event) =>
              setFullLines(event.nativeEvent.lines.length)
            }
          >
            {text}
          </Text>
        </View>
      </View>
    </PressableCard>
  );
}

ExpandableText.Skeleton = ExpandableTextSkeleton;
