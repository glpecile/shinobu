import { useIsFocused } from 'expo-router';
import type { ReactNode } from 'react';

import { useBootRevealed } from '@/components/boot-splash/revealed';

/**
 * Wraps a tab screen that isn't Home. NativeTabs mounts every tab together
 * with the launch tab, which held the boot splash through all four first
 * renders, so the others wait for the reveal unless they are focused.
 */
export function DeferredTab({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  const revealed = useBootRevealed();
  return focused || revealed ? children : null;
}
