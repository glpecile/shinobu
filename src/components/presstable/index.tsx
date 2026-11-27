import { createAnimatedPressable, PressableOpacity } from 'pressto';
import type { ComponentProps, MouseEventHandler } from 'react';
import { interpolate, useReducedMotion } from 'react-native-reanimated';
import { withUniwind } from '@/lib/with-uniwind';

import { longPressAction, usePressHandler, type PressBehaviorProps } from './press-behavior';

export { longPressAction, type PressBehavior } from './press-behavior';

// `withUniwind` is required because Uniwind drops `className` on raw third-party components
// on native (docs/solutions/uniwind-classname-third-party-components.md).

// Disables RNGH BaseButton's Android ripple, which ignores child border radius
// (docs/solutions/android-ripple-ignores-child-radius.md). `'transparent'` skips
// `createSelectableDrawable` entirely, whereas `undefined` falls back to the theme ripple.
const RIPPLE_COLOR = 'transparent';

const PressableScale = createAnimatedPressable<{ minScale?: number; reduceMotion?: boolean }>(
  (progress, { config, metadata }) => {
    'worklet';
    if (metadata?.reduceMotion) {
      return { opacity: interpolate(progress, [0, 1], [1, config.activeOpacity]) };
    }
    return {
      transform: [
        {
          scale: interpolate(
            progress,
            [0, 1],
            [config.baseScale, metadata?.minScale ?? config.minScale],
          ),
        },
      ],
    };
  },
);
const UniwindPressableScale = withUniwind(PressableScale);
const UniwindPressableOpacity = withUniwind(PressableOpacity);

export function PresstableScale({
  minScale,
  onPress,
  onLongPress,
  pressBehavior = 'prevent-repeat',
  ...rest
}: Omit<ComponentProps<typeof UniwindPressableScale>, 'metadata' | 'onPressIn' | 'onLongPress'> &
  PressBehaviorProps & {
    minScale?: number;
    onLongPress?: () => void;
  }) {
  const handlePress = usePressHandler(onPress, pressBehavior);
  const reduceMotion = useReducedMotion();
  // Android refresh pulls can leave the button without activating a scroll gesture.
  return (
    <UniwindPressableScale
      rippleColor={RIPPLE_COLOR}
      shouldCancelWhenOutside
      {...longPressAction(onLongPress)}
      {...rest}
      onLongPress={onLongPress}
      metadata={{ minScale, reduceMotion }}
      onPress={handlePress}
    />
  );
}

export function PresstableOpacity({
  onPress,
  onLongPress,
  pressBehavior = 'prevent-repeat',
  ...rest
}: Omit<ComponentProps<typeof UniwindPressableOpacity>, 'onPressIn' | 'onLongPress'> &
  PressBehaviorProps & {
    onLongPress?: () => void;
    /** Web-only DOM handler, typed here because callers type-check against this file. */
    onMouseDown?: MouseEventHandler<HTMLElement>;
  }) {
  const handlePress = usePressHandler(onPress, pressBehavior);
  return (
    <UniwindPressableOpacity
      rippleColor={RIPPLE_COLOR}
      shouldCancelWhenOutside
      {...longPressAction(onLongPress)}
      {...rest}
      onLongPress={onLongPress}
      onPress={handlePress}
    />
  );
}
