import { PressableOpacity, PressableScale } from 'pressto';
import { useRef, type ComponentProps } from 'react';
import { withUniwind } from 'uniwind';

/**
 * The app's pressables — pressto (gesture-handler + reanimated, animated on
 * the UI thread) instead of react-native's core Pressable, with a built-in
 * leading-edge press debounce: the first press fires immediately, repeats
 * inside the window are dropped. This is what stops a quick double-tap on a
 * media card from pushing the details route twice. Both raw imports are
 * oxlint-banned; `withUniwind` because className on a raw third-party
 * component is silently dropped on native
 * (docs/solutions/uniwind-classname-third-party-components.md).
 */
const PRESS_DEBOUNCE_MS = 500;

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

const UniwindPressableScale = withUniwind(PressableScale);
const UniwindPressableOpacity = withUniwind(PressableOpacity);

function useDebouncedPress<Args extends unknown[]>(
  onPress: ((...args: Args) => void) | undefined,
): (...args: Args) => void {
  const lastPressAtRef = useRef(0);

  return (...args: Args) => {
    const now = Date.now();
    if (now - lastPressAtRef.current < PRESS_DEBOUNCE_MS) return;
    lastPressAtRef.current = now;
    onPress?.(...args);
  };
}

/** Scales down while pressed — media cards, poster-like surfaces. */
export function PresstableScale({
  onPress,
  ...rest
}: ComponentProps<typeof UniwindPressableScale>) {
  const debouncedPress = useDebouncedPress(onPress);
  return (
    <UniwindPressableScale
      rippleColor={RIPPLE_COLOR}
      {...rest}
      onPress={debouncedPress}
    />
  );
}

/** Dims while pressed — buttons, icon taps, inline text actions. */
export function PresstableOpacity({
  onPress,
  ...rest
}: ComponentProps<typeof UniwindPressableOpacity>) {
  const debouncedPress = useDebouncedPress(onPress);
  return (
    <UniwindPressableOpacity
      rippleColor={RIPPLE_COLOR}
      {...rest}
      onPress={debouncedPress}
    />
  );
}
