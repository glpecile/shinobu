import { createAnimatedPressable, PressableOpacity } from 'pressto';
import { useRef, type ComponentProps, type MouseEventHandler } from 'react';
import { interpolate } from 'react-native-reanimated';
import { withUniwind } from '@/lib/with-uniwind';

/**
 * The app's pressables — pressto (gesture-handler + reanimated, animated on
 * the UI thread) instead of react-native's core Pressable, with a built-in
 * repeat protection by default: the first press fires immediately, repeats
 * within 500 ms are dropped. Disclosures use `pressBehavior="immediate"` so
 * every press toggles, even during an animation. Both raw imports are
 * oxlint-banned; `withUniwind` because className on a raw third-party
 * component is silently dropped on native
 * (docs/solutions/uniwind-classname-third-party-components.md).
 */
const PRESS_DEBOUNCE_MS = 500;

export type PressBehavior = 'immediate' | 'prevent-repeat';

type PressBehaviorProps = {
  /** `immediate` accepts every press; `prevent-repeat` (default) drops repeats within 500 ms. */
  pressBehavior?: PressBehavior;
};

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
const PressableScale = createAnimatedPressable<{ minScale?: number }>(
  (progress, { config, metadata }) => {
    'worklet';
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

function usePressHandler<Args extends unknown[]>(
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
 * Scales down while pressed — media cards, poster-like surfaces. `minScale`
 * softens the shrink for a wide surface, where the default 0.96 reads as a
 * lurch.
 */
export function PresstableScale({
  minScale,
  onPress,
  pressBehavior = 'prevent-repeat',
  ...rest
}: Omit<ComponentProps<typeof UniwindPressableScale>, 'metadata'> & PressBehaviorProps & {
  minScale?: number;
}) {
  const handlePress = usePressHandler(onPress, pressBehavior);
  return (
    <UniwindPressableScale
      rippleColor={RIPPLE_COLOR}
      {...rest}
      metadata={{ minScale }}
      onPress={handlePress}
    />
  );
}

/** Dims while pressed — buttons, icon taps, inline text actions. */
export function PresstableOpacity({
  onPress,
  pressBehavior = 'prevent-repeat',
  ...rest
}: ComponentProps<typeof UniwindPressableOpacity> & PressBehaviorProps & {
  /** Web-only DOM handler, forwarded by pressto but omitted from its prop types. */
  onMouseDown?: MouseEventHandler<HTMLElement>;
}) {
  const handlePress = usePressHandler(onPress, pressBehavior);
  return (
    <UniwindPressableOpacity
      rippleColor={RIPPLE_COLOR}
      {...rest}
      onPress={handlePress}
    />
  );
}
