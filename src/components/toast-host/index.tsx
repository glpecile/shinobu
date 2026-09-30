import { useColorScheme } from 'react-native';
import { type EntryExitAnimationFunction, withTiming } from 'react-native-reanimated';
import { Toaster } from 'sonner-native';

import { DURATION, KEYFRAME_EASE_OUT } from '@/lib/motion';

const ENTER: EntryExitAnimationFunction = () => {
  'worklet';
  const timing = { duration: DURATION.enter, easing: KEYFRAME_EASE_OUT };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -16 }, { scale: 0.97 }] },
    animations: {
      opacity: withTiming(1, timing),
      transform: [{ translateY: withTiming(0, timing) }, { scale: withTiming(1, timing) }],
    },
  };
};
const EXIT: EntryExitAnimationFunction = () => {
  'worklet';
  const timing = { duration: DURATION.exit, easing: KEYFRAME_EASE_OUT };
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    animations: {
      opacity: withTiming(0, timing),
      transform: [{ translateY: withTiming(-16, timing) }, { scale: withTiming(0.97, timing) }],
    },
  };
};

/**
 * Native host: sonner-native's `<Toaster />`, mounted once at the root
 * (plan 0032 U1) — inside `GestureHandlerRootView`, which sonner-native's
 * dismiss gestures require. Themed to the OS scheme like the web sibling.
 */
export function ToastHost() {
  const colorScheme = useColorScheme();
  const theme =
    colorScheme === 'dark' || colorScheme === 'light' ? colorScheme : 'system';
  return <Toaster theme={theme} animation={{ enter: ENTER, exit: EXIT }} />;
}
