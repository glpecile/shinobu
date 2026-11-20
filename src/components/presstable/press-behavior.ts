import { useRef } from 'react';
import type { AccessibilityActionEvent } from 'react-native';

const PRESS_DEBOUNCE_MS = 500;

export type PressBehavior = 'immediate' | 'prevent-repeat';

export type PressBehaviorProps = {
  /** `immediate` accepts every press; `prevent-repeat` (default) drops repeats within 500 ms. */
  pressBehavior?: PressBehavior;
};

/** The first press fires at once; with `prevent-repeat`, repeats within 500 ms are dropped. */
export function usePressHandler<Args extends unknown[]>(
  onPress: ((...args: Args) => void) | undefined,
  pressBehavior: PressBehavior,
): ((...args: Args) => void) | undefined {
  const lastPressAtRef = useRef(0);

  if (pressBehavior === 'immediate') return onPress;

  return (...args: Args) => {
    const now = Date.now();
    if (now - lastPressAtRef.current < PRESS_DEBOUNCE_MS) return;
    lastPressAtRef.current = now;
    onPress?.(...args);
  };
}

/**
 * Screen readers have no long-press gesture, so a pressable with `onLongPress`
 * lists it as an accessibility action. VoiceOver and TalkBack offer it in
 * their actions menu. Spread the result on any pressable.
 */
export function longPressAction(onLongPress: (() => void) | undefined) {
  if (onLongPress == null) return {};
  return {
    accessibilityActions: [{ name: 'longpress', label: 'Show options' }],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'longpress') onLongPress();
    },
  };
}
