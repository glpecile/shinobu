import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import { useThemeColor } from '@/lib/theme-color';

/** The quiet onward link used by Home section headers. */
export function ViewAllLink({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  const accent = useThemeColor('--color-accent');
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  return (
    <View
      className="shrink-0"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <PresstableOpacity
        accessibilityLabel={`View all in ${title}`}
        accessibilityRole="button"
        className="flex-row items-center justify-end gap-1 min-h-11 min-w-11"
        onPress={onPress}
      >
        <Text className="text-accent font-sans-semibold text-sm">View all</Text>
        <AnimatedView
          style={{
            transform: [{ translateX: hovered && !reduceMotion ? 3 : 0 }],
            transitionProperty: 'transform',
            transitionDuration: reduceMotion ? 0 : 160,
            transitionTimingFunction: 'ease-out',
          }}
        >
          <Ionicons color={accent} name="chevron-forward" size={14} />
        </AnimatedView>
      </PresstableOpacity>
    </View>
  );
}
