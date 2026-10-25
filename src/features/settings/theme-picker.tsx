import { Text, View } from 'react-native';

import { PresstableScale } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
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
  const preference = useThemePreference();

  function select(next: ThemePreference) {
    if (next === preference) return;
    haptics.selection();
    setThemePreference(next);
  }

  return (
    <View
      accessibilityLabel="Theme"
      accessibilityRole={process.env.EXPO_OS === 'web' ? undefined : 'radiogroup'}
      className="w-full max-w-sm flex-row gap-2.5"
    >
      {OPTIONS.map((option) => {
        const checked = option.value === preference;
        return (
          <PresstableScale
            accessibilityLabel={option.label}
            // RNGH web dispatches presses only for button roles.
            accessibilityRole={process.env.EXPO_OS === 'web' ? 'button' : 'radio'}
            accessibilityState={{ checked }}
            aria-pressed={process.env.EXPO_OS === 'web' ? checked : undefined}
            className="flex-1 items-center gap-2 rounded-xl web:focus-visible:outline-2 web:focus-visible:outline-foreground web:focus-visible:outline-offset-2"
            key={option.value}
            onPress={() => select(option.value)}
            pressBehavior="immediate"
          >
            {/* Transparent when unselected so selecting doesn't shift the layout. */}
            <View className={cn('w-full rounded-xl border-2 border-transparent p-0.5', checked && 'border-foreground')}>
              <View className="aspect-4/5 w-full overflow-hidden rounded-lg">
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
                {/* Drawn last so the edge stays visible over a preview matching the background. */}
                <View className="absolute inset-0 rounded-lg border border-border" style={{ pointerEvents: 'none' }} />
              </View>
            </View>
            <Text
              className={cn('font-sans text-sm text-foreground', checked && 'font-sans-semibold')}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </PresstableScale>
        );
      })}
    </View>
  );
}
