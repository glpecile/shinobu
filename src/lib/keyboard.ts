import { Keyboard } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

/**
 * Hides the keyboard without its slide. Call it before opening a sheet from a
 * field's screen: a native sheet presents under the keyboard, and one opened
 * while the keyboard slides away overlaps it. The instant hide lands before the
 * sheet's first frame, so open the sheet in the same handler.
 * The controller's dismiss is a no-op on web, which has no keyboard animation.
 */
export function dismissKeyboardNow() {
  if (process.env.EXPO_OS === 'web') {
    Keyboard.dismiss();
    return;
  }
  void KeyboardController.dismiss({ animated: false });
}
