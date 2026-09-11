import Animated from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

/**
 * Reanimated's Animated.View with uniwind className support — className on a
 * raw third-party component is silently dropped on native
 * (docs/solutions/uniwind-classname-third-party-components.md).
 */
export const AnimatedView = withUniwind(Animated.View);

/** Same wrapper for text whose colour transitions (a selected-state crossfade). */
export const AnimatedText = withUniwind(Animated.Text);
