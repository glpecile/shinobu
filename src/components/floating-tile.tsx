import { View, type StyleProp, type ViewStyle } from 'react-native';
import { css } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';

/**
 * Gentle up-and-down bob, declared as a Reanimated CSS keyframes rule —
 * runs natively and on web with no shared value or effect.
 */
const bobKeyframes = css.keyframes({
  '0%': { transform: [{ translateY: -5 }] },
  '50%': { transform: [{ translateY: 5 }] },
  '100%': { transform: [{ translateY: -5 }] },
});

/**
 * One floating corner tile of the empty-state hero. The bob is a staggered,
 * infinite CSS animation on the tile; the constant tilt lives on a plain
 * wrapper View so the keyframes only ever animate translateY.
 */
export function FloatingTile({
  children,
  delay,
  rotate,
  style,
}: {
  children: React.ReactNode;
  delay: number;
  rotate: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View className="absolute" style={[style, { transform: [{ rotate }] }]}>
      <AnimatedView
        className="flex-1 bg-surface border border-border rounded-2xl items-center justify-center"
        style={{
          animationName: bobKeyframes,
          animationDuration: 2600,
          animationTimingFunction: 'ease-in-out',
          animationIterationCount: 'infinite',
          animationDelay: delay,
        }}
      >
        {children}
      </AnimatedView>
    </View>
  );
}
