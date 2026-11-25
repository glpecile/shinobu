import { KeyboardAvoidingView as ControllerKeyboardAvoidingView } from 'react-native-keyboard-controller';
import { withUniwind } from '@/lib/with-uniwind';

/** Wrapped in `withUniwind` because `className` on raw third-party components is dropped on native (docs/solutions/uniwind-classname-third-party-components.md). */
export const KeyboardAvoidingView = withUniwind(ControllerKeyboardAvoidingView);
