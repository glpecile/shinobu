import { useState } from 'react';
import { LayoutAnimation, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { MorphText } from '@/components/morph-text';
import { PresstableOpacity } from '@/components/presstable';
import { DURATION } from '@/lib/motion';

/**
 * One CoreAnimation pass over the layout diff: everything below the paragraph
 * reflows as it opens, which a per-frame JS height animation stutters through.
 */
const DISCLOSURE_LAYOUT = LayoutAnimation.create(
  DURATION.toggle,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

const BODY = 'text-foreground/90 font-sans text-base leading-relaxed';

export function ExpandableText({ text, lines = 2 }: { text: string; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [fullLines, setFullLines] = useState(0);
  const reduceMotion = useReducedMotion();

  function toggle() {
    if (!reduceMotion) LayoutAnimation.configureNext(DISCLOSURE_LAYOUT);
    setExpanded(!expanded);
  }

  return (
    <View className="mb-6">
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
          onTextLayout={(event) => setFullLines(event.nativeEvent.lines.length)}
        >
          {text}
        </Text>
      </View>
      {fullLines > lines && (
        <PresstableOpacity className="self-start mt-1.5" onPress={toggle}>
          <MorphText className="text-accent font-sans-semibold text-sm">
            {expanded ? 'Read less' : 'Read more'}
          </MorphText>
        </PresstableOpacity>
      )}
    </View>
  );
}
