import { useState } from 'react';
import { LayoutAnimation, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { DisclosureChevron } from '@/components/disclosure-chevron';
import { MarkdownText } from '@/components/markdown-text';
import { PressableCard } from '@/components/pressable-card';
import { cn } from '@/lib/cn';
import { DISCLOSURE_LAYOUT } from '@/lib/motion';

import { ExpandableTextSkeleton } from './skeleton';

const BODY = 'text-foreground/90 font-sans text-base leading-relaxed';

/** A titled overview box; the whole card toggles between clamped and full text. */
export function ExpandableText({
  text,
  markdown,
  title = 'Overview',
  lines = 2,
  className,
}: {
  text: string;
  markdown?: string;
  title?: string;
  lines?: number;
  /** Layout only. */
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const reduceMotion = useReducedMotion();
  const expandable = fullHeight > collapsedHeight + 1;

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
      pressBehavior="immediate"
    >
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-foreground font-sans-semibold text-base">
          {title}
        </Text>
        {expandable && <DisclosureChevron open={expanded} size={18} />}
      </View>
      {/* Both copies share this box so the hidden one measures at the
        clamped one's width (an absolute child ignores the card's padding). */}
      <View>
        <View
          onLayout={(event) => {
            if (!expanded) setCollapsedHeight(event.nativeEvent.layout.height);
          }}
        >
          {markdown == null ? (
            <Text className={BODY} numberOfLines={expanded ? undefined : lines}>
              {text}
            </Text>
          ) : (
            <MarkdownText
              numberOfLines={expanded ? undefined : lines}
              text={markdown}
            />
          )}
        </View>
        {/* The hidden copy has no height constraint: iOS otherwise measures only
          the clamped content. Compare actual heights to support Markdown too. */}
        <View
          accessibilityElementsHidden
          className="absolute left-0 right-0 opacity-0"
          importantForAccessibility="no-hide-descendants"
          onLayout={(event) => setFullHeight(event.nativeEvent.layout.height)}
          style={{ pointerEvents: 'none' }}
        >
          {markdown == null ? (
            <Text className={BODY}>{text}</Text>
          ) : (
            <MarkdownText text={markdown} />
          )}
        </View>
      </View>
    </PressableCard>
  );
}

ExpandableText.Skeleton = ExpandableTextSkeleton;
