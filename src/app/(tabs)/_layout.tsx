import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { emitSearchTabPressed } from '@/features/search/focus-signal';

/**
 * Native bottom tab bar for iOS/Android — liquid glass on iOS 26, Material 3
 * on Android. Web takes a different idiom entirely (a left sidebar); see
 * `_layout.web.tsx` + `components/app-shell`. Detail/person/studio routes live
 * at the root, so they push *over* this tab bar instead of inside it.
 */
export default function TabsLayout() {
  // NativeTabs renders through react-native-screens, outside the
  // `ThemeProvider` in app/_layout.tsx — it doesn't inherit that theme, so
  // without an explicit backgroundColor Android's Material 3 default paints
  // the bar white regardless of dark mode. Matches `--color-background` in
  // global.css (same values `_layout.tsx` uses for the screen `contentStyle`).
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === 'dark' ? '#0a0a0a' : '#ffffff';

  return (
    // Vampiric Crimson selected tint (plan.md 1.1) — the brand accent, matching
    // `--color-accent` in global.css. `indicatorColor` and `rippleColor` need
    // to be explicit too: react-native-screens renders this bar in its own
    // always-Material-3 themed context (independent of the app's actual
    // Android theme), so without overrides the selected-tab pill and the
    // tap ripple both fall back to that context's baseline Material blue —
    // the ripple is what flashes blue on press before settling into the
    // (correctly red) selected pill. A translucent accent reads as a tinted
    // pill/ripple in both themes without a light/dark branch.
    <NativeTabs
      backgroundColor={backgroundColor}
      indicatorColor="rgba(220, 38, 38, 0.18)"
      minimizeBehavior="onScrollDown"
      rippleColor="rgba(220, 38, 38, 0.24)"
      tintColor="#DC2626"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon md="home" sf="house.fill" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="diary">
        <NativeTabs.Trigger.Icon md="book" sf="book.fill" />
        <NativeTabs.Trigger.Label>Diary</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="connect">
        <NativeTabs.Trigger.Icon md="settings" sf="gearshape.fill" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* Search last so it can combine with the platform search affordance.
          `listeners` fires on every tap (active tab or not) — see
          `features/search/focus-signal` for why the search screen needs it. */}
      <NativeTabs.Trigger
        listeners={{ tabPress: () => emitSearchTabPressed() }}
        name="search"
        role="search"
      >
        <NativeTabs.Trigger.Icon md="search" sf="magnifyingglass" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
