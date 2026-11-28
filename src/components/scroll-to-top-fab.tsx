import type { StyleProp, ViewStyle } from 'react-native';
import { FadeIn, FadeOut, Keyframe, useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Fab } from '@/components/fab';
import { cn } from '@/lib/cn';
import { DURATION, KEYFRAME_EASE_EXIT, KEYFRAME_EASE_OUT } from '@/lib/motion';

export const SCROLL_TO_TOP_THRESHOLD = 300;

const FAB_RISE = 8;

const fabEntering = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.85 }, { translateY: FAB_RISE }] },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }, { translateY: 0 }],
    easing: KEYFRAME_EASE_OUT,
  },
}).duration(DURATION.enter);

const fabExiting = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] },
  100: {
    opacity: 0,
    transform: [{ scale: 0.85 }, { translateY: FAB_RISE }],
    easing: KEYFRAME_EASE_EXIT,
  },
}).duration(DURATION.exit);

const fabFadingIn = FadeIn.duration(DURATION.enter);
const fabFadingOut = FadeOut.duration(DURATION.exit);

/**
 * Pinned to the bottom-right. A stack screen passes a `style` bottom that
 * clears the safe area; a tab screen moves it above its tab bar with `className`.
 */
export function ScrollToTopFab({
  visible,
  onPress,
  className,
  style,
}: {
  visible: boolean;
  onPress: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  if (!visible) return null;
  return (
    <AnimatedView
      className={cn('absolute bottom-6 right-6', className)}
      entering={reduceMotion ? fabFadingIn : fabEntering}
      exiting={reduceMotion ? fabFadingOut : fabExiting}
      style={style}
    >
      <Fab icon="arrow-up" label="Scroll to top" onPress={onPress} />
    </AnimatedView>
  );
}
