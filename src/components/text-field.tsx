import { useState, type Ref } from 'react';
import type { TextInputInstance, TextInputProps } from 'react-native';

import { AnimatedTextInput } from '@/components/animated-view';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

/**
 * The app's pill text input, with the search field's accent border on focus.
 * Takes every `TextInput` prop but `className`; `multiline` rounds it into a box.
 * `size="sm"` matches a `size="sm"` segmented control beside it: 36 tall, and
 * 32 on iOS, where SwiftUI draws the native control at 32 at the top of its box.
 */
export function TextField({ size = 'md', ...props }: Omit<TextInputProps, 'className'> & {
  ref?: Ref<TextInputInstance>;
  size?: 'sm' | 'md';
}) {
  const [focused, setFocused] = useState(false);
  const muted = useThemeColor('--color-muted');
  const accent = useThemeColor('--color-accent');
  const border = useThemeColor('--color-border');
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
