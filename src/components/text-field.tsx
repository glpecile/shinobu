import { useState, type Ref } from 'react';
import type { TextInputInstance, TextInputProps } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

import { AnimatedTextInput } from '@/components/animated-view';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

function dismissOnSubmit() {
  void KeyboardController.dismiss();
}

/** `size="sm"` is `ios:h-8` (32pt) to match SwiftUI's small segmented control height. */
export function TextField({ size = 'md', ...props }: Omit<TextInputProps, 'className'> & {
  ref?: Ref<TextInputInstance>;
  size?: 'sm' | 'md';
}) {
  const [focused, setFocused] = useState(false);
  const muted = useThemeColor('--color-muted');
  const accent = useThemeColor('--color-accent');
  const border = useThemeColor('--color-border');
  const dismissOnDone = process.env.EXPO_OS === 'android' &&
    props.returnKeyType === 'done' && !props.multiline && props.onSubmitEditing == null &&
    props.submitBehavior == null && props.blurOnSubmit == null;
  return (
    <AnimatedTextInput
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={muted}
      selectionColor={accent}
      cursorColor={accent}
      selectionHandleColor={accent}
      textAlignVertical={props.multiline ? 'top' : undefined}
      {...props}
      // Let the controller hide the Android IME while this field still owns focus.
      submitBehavior={dismissOnDone ? 'submit' : props.submitBehavior}
      onSubmitEditing={dismissOnDone ? dismissOnSubmit : props.onSubmitEditing}
      // react-native-web ignores the `textAlign` prop, so centring rides as a class too.
      className={cn('border bg-surface text-foreground px-4 py-3 rounded-full font-sans outline-none caret-accent', props.multiline && 'rounded-2xl min-h-24', size === 'sm' && 'h-9 ios:h-8 px-3 py-0 web:text-sm', props.textAlign === 'center' && 'text-center')}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      style={{
        borderColor: focused ? accent : border,
        transitionProperty: 'borderColor',
        transitionDuration: DURATION.color,
        transitionTimingFunction: EASE_OUT,
      }}
    />
  );
}
