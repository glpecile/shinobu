import { KeyboardAwareScrollView as ControllerKeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { withUniwind } from 'uniwind';

/**
 * Scroll view that both pads for the soft keyboard *and* scrolls the focused
 * input into view — react-native-keyboard-controller's implementation, the same
 * mandated source as `components/keyboard-avoiding-view`. Reach for this one
 * when the keyboard-avoiding surface is itself scrollable (a long form, the log
 * sheet); reach for the plain `KeyboardAvoidingView` when it isn't.
 *
 * Wrapped in `withUniwind` because className on a raw third-party component is
 * silently dropped on native (docs/solutions/uniwind-classname-third-party-components.md).
 * The HOC maps every `*ClassName` prop to its `*Style` counterpart, so
 * `contentContainerClassName` works here exactly as it does on uniwind's own
 * `ScrollView`.
 */
export const KeyboardAwareScrollView = withUniwind(
  ControllerKeyboardAwareScrollView,
);
