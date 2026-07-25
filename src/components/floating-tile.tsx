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
 *
 * Pure decoration: `pointerEvents="none"` so a tile overlapping a CTA can never
 * swallow the tap meant for it. Set `floating={false}` to lay the tile out in
 * normal flow instead of absolutely — the compact empty state does this so the
 * marks sit above the copy rather than painting over it.
 */
export function FloatingTile({
  children,
  delay,
  floating = true,
  rotate,
  style,
}: {
  children: React.ReactNode;
  delay: number;
  floating?: boolean;
  rotate: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      className={floating ? 'absolute' : 'relative'}
      pointerEvents="none"
      style={[style, { transform: [{ rotate }] }]}
    >
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
