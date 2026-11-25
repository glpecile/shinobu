import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { CSS_EASE_OUT, DURATION } from '@/lib/motion';

const timing = {
  animationDuration: `${DURATION.swap}ms`,
  animationTimingFunction: CSS_EASE_OUT,
};

// `animationKeyframes` is a react-native-web-only key: it only compiles
// through `StyleSheet.create` (inline styles drop it) and isn't in `ViewStyle`.
const styles = StyleSheet.create({
  enter: {
    ...timing,
    animationKeyframes: {
      from: { opacity: 0, filter: 'blur(6px)' },
      to: { opacity: 1, filter: 'blur(0)' },
    },
  },
  fade: {
    ...timing,
    animationKeyframes: { from: { opacity: 0 }, to: { opacity: 1 } },
  },
} as unknown as Record<'enter' | 'fade', ViewStyle>);

export function usePageEnterStyle(): StyleProp<ViewStyle> {
  return useReducedMotion() ? styles.fade : styles.enter;
}
