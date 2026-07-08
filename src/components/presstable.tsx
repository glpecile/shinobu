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
  return <UniwindPressableScale {...rest} onPress={debouncedPress} />;
}

/** Dims while pressed — buttons, icon taps, inline text actions. */
export function PresstableOpacity({
  onPress,
  ...rest
}: ComponentProps<typeof UniwindPressableOpacity>) {
  const debouncedPress = useDebouncedPress(onPress);
  return <UniwindPressableOpacity {...rest} onPress={debouncedPress} />;
}
