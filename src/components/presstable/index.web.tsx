import type { ComponentProps } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { longPressAction, usePressHandler, type PressBehaviorProps } from './press-behavior';

export { longPressAction, type PressBehavior } from './press-behavior';

/*
 * Web: react-native-web's Pressable, not pressto, whose gesture handler and
 * Reanimated mappers run in JS here (docs/solutions/web-pressables-skip-gesture-handler.md).
 */

// pressto's defaults: activeOpacity, minScale, and its 250 ms timing curve,
// which is CSS `ease`.
const ACTIVE_OPACITY = 0.5;
const MIN_SCALE = 0.96;
// react-native's types lack CSS transitions; react-native-web applies them.
const FEEDBACK = {
  transitionDuration: '250ms',
  transitionProperty: 'opacity, transform',
  transitionTimingFunction: 'ease',
  // Gesture handler's button default, so a long press on a card doesn't select its text.
  userSelect: 'none',
} as ViewStyle;

type PresstableProps = Omit<ComponentProps<typeof Pressable>, 'onPress' | 'onLongPress' | 'onPressIn' | 'style'>
  & PressBehaviorProps & {
    onPress?: () => void;
    onLongPress?: () => void;
    style?: StyleProp<ViewStyle>;
  };

function WebPresstable({
  onPress,
  onLongPress,
  pressBehavior = 'prevent-repeat',
  style,
  pressedStyle,
  ...rest
}: PresstableProps & { pressedStyle: ViewStyle }) {
  const handlePress = usePressHandler(onPress, pressBehavior);
  return (
    <Pressable
      {...longPressAction(onLongPress)}
      {...rest}
      // Always a button, as pressto rendered it: react-native-web skips Enter
      // on a `link` div and Space on any role but button.
      accessibilityRole="button"
      onLongPress={onLongPress}
      onPress={handlePress}
      style={({ pressed }) => [FEEDBACK, style, pressed && pressedStyle]}
    />
  );
}

/**
 * Scales down while pressed — media cards, poster-like surfaces. `minScale`
 * softens the shrink for a wide surface, where the default 0.96 reads as a
 * lurch.
 */
export function PresstableScale({ minScale = MIN_SCALE, ...props }: PresstableProps & { minScale?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <WebPresstable
      {...props}
      pressedStyle={reduceMotion ? { opacity: ACTIVE_OPACITY } : { transform: [{ scale: minScale }] }}
    />
  );
}

/** Dims while pressed — buttons, icon taps, inline text actions. */
export function PresstableOpacity(props: PresstableProps) {
  return <WebPresstable {...props} pressedStyle={{ opacity: ACTIVE_OPACITY }} />;
}
