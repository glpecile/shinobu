import { useColorScheme } from 'react-native';
import { Keyframe } from 'react-native-reanimated';
import { Toaster } from 'sonner-native';

import { DURATION, KEYFRAME_EASE_OUT } from '@/lib/motion';

const ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -16 }, { scale: 0.97 }] },
  100: {
    opacity: 1,
    transform: [{ translateY: 0 }, { scale: 1 }],
    easing: KEYFRAME_EASE_OUT,
  },
}).duration(DURATION.enter);
const EXIT = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
  100: {
    opacity: 0,
    transform: [{ translateY: -16 }, { scale: 0.97 }],
    easing: KEYFRAME_EASE_OUT,
  },
}).duration(DURATION.exit);

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
