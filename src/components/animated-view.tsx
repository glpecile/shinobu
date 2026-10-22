import { TextInput } from 'react-native';
import { ScrollView as GestureHandlerScrollView } from 'react-native-gesture-handler';
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

/**
 * A vertical scroll surface whose rows are pressables. Pressables are
 * gesture-handler buttons, and only gesture-handler's ScrollView cancels them
 * when a drag becomes a scroll; inside React Native's own, a finger that stops
 * a fling or starts a scroll lifts as a press
 * (docs/solutions/ghost-taps-while-scrolling.md).
 */
export const GestureScrollView = withUniwind(
  Animated.createAnimatedComponent(GestureHandlerScrollView),
);

/** Same wrapper for a field whose border transitions on focus. */
export const AnimatedTextInput = withUniwind(
  Animated.createAnimatedComponent(TextInput),
);
