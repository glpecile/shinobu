import { createAnimatedPressable, PressableOpacity } from 'pressto';
import type { ComponentProps, MouseEventHandler } from 'react';
import { interpolate, useReducedMotion } from 'react-native-reanimated';
import { withUniwind } from '@/lib/with-uniwind';

import { longPressAction, usePressHandler, type PressBehaviorProps } from './press-behavior';

export { longPressAction, type PressBehavior } from './press-behavior';

/*
 * The app's pressables on native — pressto (gesture-handler + reanimated,
 * animated on the UI thread) instead of react-native's core Pressable, with a
 * built-in repeat protection by default: the first press fires immediately,
 * repeats within 500 ms are dropped. Disclosures use `pressBehavior="immediate"`
 * so every press toggles, even during an animation. Both raw imports are
 * oxlint-banned; `withUniwind` because className on a raw third-party
 * component is silently dropped on native
 * (docs/solutions/uniwind-classname-third-party-components.md). Web uses
 * react-native-web's Pressable instead (`index.web.tsx`).
 */

/**
 * Android only, and the reason it's here rather than at a call site: pressto
 * renders RNGH's `BaseButton`, which on Android carries the platform's
 * `selectableItemBackground` ripple. That ripple is masked by the *button's*
 * own border radius — zero unless someone repeats the child's radius on the
 * pressable — so it paints a rectangle of highlight behind whatever rounded
 * thing the pressable actually wraps
 * (docs/solutions/android-ripple-ignores-child-radius.md).
 *
 * Nobody asked for it. The app's press feedback is pressto's own opacity dim
 * and scale, which are the shape of the content by construction and identical
 * on iOS and web. Turning the ripple off is one line here instead of a
 * `rounded-*` duplicated onto every pressable in the app and kept in sync with
 * its child's radius forever — drift lint can't catch.
 *
 * `transparent` and not `undefined`: RNGH skips building the drawable entirely
 * for a transparent ripple (`createSelectableDrawable`), where `undefined`
 * means "use the theme's". Still overridable per pressable.
 */
const RIPPLE_COLOR = 'transparent';

/** pressto's own scale pressable, with the shrink overridable per instance. */
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
/*
 * Neither wrapper takes `onPressIn`: pressto 0.7 fires it from gesture-handler
 * 2's `onBegan`, which gesture-handler 3's button renamed to `onBegin`, so it
 * would never run.
 */
const UniwindPressableScale = withUniwind(PressableScale);
const UniwindPressableOpacity = withUniwind(PressableOpacity);

/**
 * Scales down while pressed — media cards, poster-like surfaces, FABs.
 * `minScale` sets the shrink: shallower for a wide surface, where the default
 * 0.96 reads as a lurch, deeper for a small one.
 */
export function PresstableScale({
  minScale,
  onPress,
  onLongPress,
  pressBehavior = 'prevent-repeat',
  ...rest
}: Omit<ComponentProps<typeof UniwindPressableScale>, 'metadata' | 'onPressIn' | 'onLongPress'> & PressBehaviorProps & {
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

/** Dims while pressed — buttons, icon taps, inline text actions. */
export function PresstableOpacity({
  onPress,
  onLongPress,
  pressBehavior = 'prevent-repeat',
  ...rest
}: Omit<ComponentProps<typeof UniwindPressableOpacity>, 'onPressIn' | 'onLongPress'> & PressBehaviorProps & {
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
