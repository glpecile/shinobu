import { TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import { withUniwind } from '@/lib/with-uniwind';

/**
 * Reanimated's Animated.View with uniwind className support — className on a
 * raw third-party component is silently dropped on native
 * (docs/solutions/uniwind-classname-third-party-components.md).
 */
export const AnimatedView = withUniwind(Animated.View);

/** Same wrapper for text whose colour transitions (a selected-state crossfade). */
export const AnimatedText = withUniwind(Animated.Text);

/** Same wrapper for a scroll view whose offset drives a shared value (a pager). */
export const AnimatedScrollView = withUniwind(Animated.ScrollView);

/** Same wrapper for a field whose border transitions on focus. */
export const AnimatedTextInput = withUniwind(
  Animated.createAnimatedComponent(TextInput),
);
