import type { ComponentProps } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { CSS_EASE_OUT, DURATION } from '@/lib/motion';

import { usePressHandler, type PressBehaviorProps } from './press-behavior';

export { longPressAction, type PressBehavior } from './press-behavior';

/*
 * Web: react-native-web's Pressable, not pressto, whose gesture handler and
 * Reanimated mappers run in JS here (docs/solutions/web-pressables-skip-gesture-handler.md).
 */

const ACTIVE_OPACITY = 0.5;
const MIN_SCALE = 0.96;
// react-native's types lack CSS transitions; react-native-web applies them.
const FEEDBACK = {
  transitionDuration: `${DURATION.enter}ms`,
  transitionProperty: 'opacity, transform',
  transitionTimingFunction: CSS_EASE_OUT,
  userSelect: 'none',
} as ViewStyle;

type PresstableProps = Omit<
  ComponentProps<typeof Pressable>,
  'onPress' | 'onLongPress' | 'onPressIn' | 'style'
> &
  PressBehaviorProps & {
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
      {...rest}
      // Always a button: react-native-web skips Enter on a `link` div and Space
      // on any role but button. It also drops `accessibilityActions`, so the
      // long-press action is native only.
      accessibilityRole="button"
      onLongPress={onLongPress}
      onPress={handlePress}
      style={({ pressed }) => [FEEDBACK, style, pressed && pressedStyle]}
    />
  );
}

export function PresstableScale({
  minScale = MIN_SCALE,
  ...props
}: PresstableProps & { minScale?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <WebPresstable
      {...props}
      pressedStyle={
        reduceMotion ? { opacity: ACTIVE_OPACITY } : { transform: [{ scale: minScale }] }
      }
    />
  );
}

export function PresstableOpacity(props: PresstableProps) {
  return <WebPresstable {...props} pressedStyle={{ opacity: ACTIVE_OPACITY }} />;
}
