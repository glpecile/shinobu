import { View } from 'react-native';

import { PreviewPicker } from '@/features/settings/preview-picker';
import { cn } from '@/lib/cn';
import { setThemePreference, type ThemePreference, useThemePreference } from '@/state/prefs/theme';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const FACE = {
  light: { screen: 'bg-preview-light', ink: 'bg-preview-light-ink', line: 'bg-preview-light-line' },
  dark: { screen: 'bg-preview-dark', ink: 'bg-preview-dark-ink', line: 'bg-preview-dark-line' },
};

/** A miniature screen in one theme: title bar, two text lines, a log button. */
function PreviewFace({ tone }: { tone: keyof typeof FACE }) {
  const face = FACE[tone];
  return (
    <View className={cn('absolute inset-0 gap-1.5 px-2.5 py-3', face.screen)}>
      <View className={cn('h-1.5 w-1/2 rounded-full', face.ink)} />
      <View className={cn('h-1.5 w-full rounded-full', face.line)} />
      <View className={cn('h-1.5 w-2/3 rounded-full', face.line)} />
      <View className="mt-auto h-1.5 w-2/5 rounded-full bg-accent" />
    </View>
  );
}

/** Appearance setting: System, Light, and Dark as preview cards in a radio group. */
export function ThemePicker() {
  return (
    <PreviewPicker label="Theme" onSelect={setThemePreference} value={useThemePreference()}>
      {OPTIONS.map((option) => (
        <PreviewPicker.Option key={option.value} value={option.value}>
          <PreviewPicker.Preview className="aspect-4/5">
            {option.value === 'system' ? (
              <>
                <PreviewFace tone="light" />
                {/* Right half clips a full-width dark face, so its lines split at the middle too. */}
                <View className="absolute inset-y-0 right-0 w-1/2 overflow-hidden">
                  <View className="absolute inset-y-0 -left-full right-0">
                    <PreviewFace tone="dark" />
                  </View>
                </View>
              </>
            ) : (
              <PreviewFace tone={option.value} />
            )}
          </PreviewPicker.Preview>
          <PreviewPicker.Label>{option.label}</PreviewPicker.Label>
        </PreviewPicker.Option>
      ))}
    </PreviewPicker>
  );
}
