import { KeyboardAvoidingView as ControllerKeyboardAvoidingView } from 'react-native-keyboard-controller';
import { withUniwind } from 'uniwind';

/**
 * The app's keyboard-avoiding view — react-native-keyboard-controller's
 * implementation (consistent cross-platform behavior, animated on the native
 * thread), never react-native's core one (oxlint-enforced). Wrapped in
 * `withUniwind` because className on a raw third-party component is silently
 * dropped on native (docs/solutions/uniwind-classname-third-party-components.md).
 */
export const KeyboardAvoidingView = withUniwind(ControllerKeyboardAvoidingView);
