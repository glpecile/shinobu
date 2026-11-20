import type { ComponentProps, MouseEventHandler } from 'react';
import { Pressable, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { longPressAction, usePressHandler, type PressBehaviorProps } from './press-behavior';

export { longPressAction, type PressBehavior } from './press-behavior';

/*
 * The app's pressables on web: react-native-web's Pressable, not pressto.
 * Every pressto button mounts a gesture handler and three Reanimated mappers,
 * and on web all of them run in JS on the main thread, on each mount, unmount
 * and re-render (docs/solutions/web-pressables-skip-gesture-handler.md). A web
 * button has no native gesture to coordinate with, so the core Pressable does
 * the job. Same props, repeat protection and feedback values as `index.tsx`.
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
    className?: string;
    onMouseDown?: MouseEventHandler<HTMLElement>;
    /** Native only: Android's button ripple and gesture-handler's leave rule. */
    rippleColor?: string;
    shouldCancelWhenOutside?: boolean;
  };

function WebPresstable({
  onPress,
  onLongPress,
  pressBehavior = 'prevent-repeat',
  style,
  pressedStyle,
  rippleColor: _rippleColor,
  shouldCancelWhenOutside: _shouldCancelWhenOutside,
  ...rest
}: PresstableProps & { pressedStyle: ViewStyle }) {
  const handlePress = usePressHandler(onPress, pressBehavior);
  return (
    <Pressable
      accessibilityRole="button"
      {...longPressAction(onLongPress)}
      {...rest}
      onLongPress={onLongPress}
      onPress={handlePress}
      style={({ pressed }: PressableStateCallbackType) => [FEEDBACK, style, pressed && pressedStyle]}
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
