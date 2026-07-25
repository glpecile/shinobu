import { useRef } from 'react';
import type { PointerEvent } from 'react-native';

import { openExternalUrl } from '@/lib/open-external-url';

export interface NewTabPress {
  /** Spread onto the pressable's *wrapper* — pointer-down bubbles up to it. */
  onPointerDown: (event: PointerEvent) => void;
  /** True when the press was consumed by opening a new tab — bail out then. */
  opened: () => boolean;
}

/**
 * Web-only ⌘/Ctrl+click → open `href` in a new tab, for rows and cards that
 * navigate but can't *be* anchors: RNGH kills `onPress` for any accessibility
 * role other than "button" (docs/solutions/web-pressto-accessibility-role-
 * kills-onpress.md), and pressto's press callback carries no DOM event. So the
 * modifier state is latched on pointer-down (it bubbles up from the pressable)
 * and read back when the press lands.
 *
 *   const newTab = useNewTabPress(routes.details(item.id));
 *   <View onPointerDown={newTab.onPointerDown}>
 *     <PresstableScale onPress={() => { if (newTab.opened()) return; onPress(); }}>
 *
 * On native `opened()` is always false — the gesture doesn't exist there — so
 * call sites need no platform branch of their own.
 */
export function useNewTabPress(href: string): NewTabPress {
  const modifierHeldRef = useRef(false);

  function onPointerDown(event: PointerEvent) {
    modifierHeldRef.current =
      event.nativeEvent.metaKey || event.nativeEvent.ctrlKey;
  }

  function opened(): boolean {
    if (process.env.EXPO_OS !== 'web' || !modifierHeldRef.current) return false;
    modifierHeldRef.current = false;
    void openExternalUrl(href);
    return true;
  }

  return { onPointerDown, opened };
}
