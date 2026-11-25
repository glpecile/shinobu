import { useIsFocused } from 'expo-router';
import type { ReactNode } from 'react';

import { useBootRevealed } from '@/components/boot-splash/revealed';

/**
 * `NativeTabs` mounts all tabs alongside the launch tab; gate non-Home tabs
 * on `useBootRevealed` unless focused so they don't delay the boot splash.
 */
export function DeferredTab({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  const revealed = useBootRevealed();
  return focused || revealed ? children : null;
}
