import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { CSS_EASE_OUT, DURATION } from '@/lib/motion';

/**
 * Web has no stack transition: a pushed screen (or a tab switch under `Slot`)
 * just pops into place. This is the enter every fresh page plays instead — a
 * short blur-fade rather than a slide, because two unrelated pages crossfading
 * read as two objects swapping; a few px of blur bridges them into one surface
 * settling (the "blur masks an imperfect transition" trick).
 *
 * `animationKeyframes` is react-native-web's own style key: it only compiles
 * through `StyleSheet.create` (inline styles drop it), and it isn't in RN's
 * `ViewStyle`, hence the cast. Keyframe values are plain CSS strings.
 */
const timing = {
  animationDuration: `${DURATION.swap}ms`,
  animationTimingFunction: CSS_EASE_OUT,
};

const styles = StyleSheet.create({
  enter: {
    ...timing,
    animationKeyframes: {
      from: { opacity: 0, filter: 'blur(6px)' },
      to: { opacity: 1, filter: 'blur(0)' },
    },
  },
  /** Reduced motion keeps the fade (it aids comprehension) and drops the blur. */
  fade: {
    ...timing,
    animationKeyframes: { from: { opacity: 0 }, to: { opacity: 1 } },
  },
} as unknown as Record<'enter' | 'fade', ViewStyle>);

export function usePageEnterStyle(): StyleProp<ViewStyle> {
  return useReducedMotion() ? styles.fade : styles.enter;
}
