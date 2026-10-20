import type { CSSProperties } from 'react';
import { useColorScheme } from 'react-native';
import { Toaster } from 'sonner';

import { CSS_EASE_OUT, DURATION } from '@/lib/motion';

import './toast-motion.css';

/**
 * Web host: sonner's `<Toaster />`, mounted once at the root (plan 0032 U1).
 * Themed to the OS scheme the same way the rest of the app is (Uniwind
 * `system` mode) — sonner would otherwise default to light and draw a white
 * toast over the dark UI.
 */
export function ToastHost() {
  const colorScheme = useColorScheme();
  const theme =
    colorScheme === 'dark' || colorScheme === 'light' ? colorScheme : 'system';
  return (
    <Toaster
      expand
      // Phones clear the bottom nav bar (`components/app-shell`): 76px plus
      // the home indicator, and sonner's 16px gap.
      mobileOffset={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)' }}
      position="bottom-right"
      theme={theme}
      style={{
        '--toast-enter': `${DURATION.enter}ms`,
        '--toast-exit': `${DURATION.exit}ms`,
        '--toast-ease': CSS_EASE_OUT,
      } as CSSProperties}
    />
  );
}
