import { useColorScheme } from 'react-native';
import { Toaster } from 'burnt/web';

/**
 * burnt's web path renders through sonner, which needs its `<Toaster />`
 * mounted once at the root (plan 0032 U1). Themed to the OS scheme the same
 * way the rest of the app is (Uniwind `system` mode) — sonner would otherwise
 * default to light and draw a white toast over the dark UI.
 */
export function ToastHost() {
  const colorScheme = useColorScheme();
  const theme =
    colorScheme === 'dark' || colorScheme === 'light' ? colorScheme : 'system';
  return <Toaster position="bottom-right" theme={theme} />;
}
