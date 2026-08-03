import { useColorScheme } from 'react-native';
import { Toaster } from 'sonner-native';

/**
 * Native host: sonner-native's `<Toaster />`, mounted once at the root
 * (plan 0032 U1) — inside `GestureHandlerRootView`, which sonner-native's
 * dismiss gestures require. Themed to the OS scheme like the web sibling.
 */
export function ToastHost() {
  const colorScheme = useColorScheme();
  const theme =
    colorScheme === 'dark' || colorScheme === 'light' ? colorScheme : 'system';
  return <Toaster theme={theme} />;
}
