import { useState, type Ref } from 'react';
import { Platform, type TextInputInstance, type TextInputProps } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

import { AnimatedTextInput } from '@/components/animated-view';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

/** `size="sm"` is `ios:h-8` (32pt) to match SwiftUI's small segmented control height. */
export function TextField({
  size = 'md',
  ...props
}: Omit<TextInputProps, 'className'> & {
  ref?: Ref<TextInputInstance>;
  size?: 'sm' | 'md';
}) {
  const [focused, setFocused] = useState(false);
  const muted = useThemeColor('--color-muted');
  const accent = useThemeColor('--color-accent');
  const border = useThemeColor('--color-border');
  // API 28 and below keep React Native's blur, which guards against refocus (docs/solutions/android-done-key-in-log-sheets.md).
  const dismissOnDone =
    Platform.OS === 'android' &&
    Platform.Version > 28 &&
    props.returnKeyType === 'done' &&
    !props.multiline &&
    props.onSubmitEditing == null &&
    props.submitBehavior == null;
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
      submitBehavior={dismissOnDone ? 'submit' : props.submitBehavior}
      onSubmitEditing={
        dismissOnDone ? () => void KeyboardController.dismiss() : props.onSubmitEditing
      }
      // react-native-web ignores the `textAlign` prop, so centring rides as a class too.
      className={cn(
        'border bg-surface text-foreground px-4 py-3 rounded-full font-sans outline-none caret-accent',
        props.multiline && 'rounded-2xl min-h-24',
        size === 'sm' && 'h-9 ios:h-8 px-3 py-0 web:text-sm',
        props.textAlign === 'center' && 'text-center',
        props.inputMode === 'numeric' && 'tabular-nums',
      )}
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
