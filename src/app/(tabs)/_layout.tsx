import { NativeTabs } from 'expo-router/native-tabs';
import { haptics } from '@/lib/haptics';

import { emitSearchFocusRequest } from '@/features/search/focus-signal';
import { emitTabPress } from '@/lib/navigation/tab-double-tap';
import { useThemeColor } from '@/lib/theme-color';

export default function TabsLayout() {
  // NativeTabs renders outside ThemeProvider; without explicit backgroundColor, Android Material 3 paints the bar white.
  const background = useThemeColor('--color-background');
  const foreground = useThemeColor('--color-foreground');
  const accent = useThemeColor('--color-accent');
  const accentTonal = useThemeColor('--color-accent-tonal');
  const accentOnTonal = useThemeColor('--color-accent-on-tonal');
  const android =
    process.env.EXPO_OS === 'android'
      ? {
          iconColor: { default: foreground, selected: accentOnTonal },
          indicatorColor: accentTonal,
          // Material 3 hides inactive labels past 3 tabs unless labeled.
          labelVisibilityMode: 'labeled' as const,
          // Android falls back to tintColor unless selected is explicit, and reads font weight from default only.
          labelStyle: {
            default: { color: foreground },
            selected: { color: foreground },
          },
        }
      : {};

  return (
    // react-native-screens renders in its own Material 3 context, so indicatorColor/rippleColor flash blue unless overridden.
    <NativeTabs
      backgroundColor={background}
      indicatorColor="rgba(220, 38, 38, 0.18)"
      minimizeBehavior="onScrollDown"
      rippleColor="rgba(220, 38, 38, 0.24)"
      screenListeners={{ tabPress: () => haptics.selection() }}
      tintColor={accent}
      {...android}
    >
      <NativeTabs.Trigger
        listeners={{ tabPress: () => emitTabPress('index') }}
        name="index"
      >
        <NativeTabs.Trigger.Icon md="home" sf="house.fill" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        listeners={{ tabPress: () => emitTabPress('diary') }}
        name="diary"
      >
        <NativeTabs.Trigger.Icon md="book" sf="book.fill" />
        <NativeTabs.Trigger.Label>Diary</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        listeners={{ tabPress: () => emitTabPress('settings') }}
        name="settings"
      >
        <NativeTabs.Trigger.Icon md="settings" sf="gearshape.fill" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        listeners={{ tabPress: () => emitSearchFocusRequest() }}
        name="search"
        role="search"
      >
        <NativeTabs.Trigger.Icon md="search" sf="magnifyingglass" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
