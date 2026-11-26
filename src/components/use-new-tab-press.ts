import { useRef } from 'react';
import type { PointerEvent } from 'react-native';

import { openExternalUrl } from '@/lib/open-external-url';

export interface NewTabPress {
  /** Spread onto the pressable's *wrapper* — pointer-down bubbles up to it. */
  onPointerDown: (event: PointerEvent) => void;
  opened: () => boolean;
}

/**
 * Web-only ⌘/Ctrl+click to open `href` in a new tab when the pressable's `onPress`
 * receives no pointer event. Always returns `false` from `opened()` on native.
 */
export function useNewTabPress(href: string): NewTabPress {
  const modifierHeldRef = useRef(false);

  function onPointerDown(event: PointerEvent) {
    modifierHeldRef.current = event.nativeEvent.metaKey || event.nativeEvent.ctrlKey;
  }

  function opened(): boolean {
    if (process.env.EXPO_OS !== 'web' || !modifierHeldRef.current) return false;
    modifierHeldRef.current = false;
    void openExternalUrl(href);
    return true;
  }

  return { onPointerDown, opened };
}
