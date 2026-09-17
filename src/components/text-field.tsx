import { useState } from 'react';
import type { TextInputProps } from 'react-native';

import { AnimatedTextInput } from '@/components/animated-view';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

/**
 * The app's pill text input, with the search field's accent border on focus.
 * Takes every `TextInput` prop but `className`.
 */
export function TextField(props: Omit<TextInputProps, 'className'>) {
  const [focused, setFocused] = useState(false);
  const muted = useThemeColor('--color-muted');
  const accent = useThemeColor('--color-accent');
  const border = useThemeColor('--color-border');
  return (
    <AnimatedTextInput
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={muted}
      {...props}
      className="border bg-surface text-foreground px-4 py-3 rounded-full font-sans outline-none"
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
