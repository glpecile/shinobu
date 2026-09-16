import { TextInput, type TextInputProps } from 'react-native';

import { useThemeColor } from '@/lib/theme-color';

/** The app's pill text input. Takes every `TextInput` prop but `className`. */
export function TextField(props: Omit<TextInputProps, 'className'>) {
  const muted = useThemeColor('--color-muted');
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={muted}
      {...props}
      className="border border-border bg-surface text-foreground px-4 py-3 rounded-full font-sans"
    />
  );
}
