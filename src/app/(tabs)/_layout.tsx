import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { emitSearchFocusRequest } from '@/features/search/focus-signal';
import { emitTabPress } from '@/lib/navigation/tab-double-tap';
import { useThemeColor } from '@/lib/theme-color';

/**
 * Native bottom tab bar for iOS/Android — liquid glass on iOS 26, Material 3
 * on Android. Web takes a different idiom entirely (a left sidebar); see
 * `_layout.web.tsx` + `components/app-shell`. Detail/person/studio routes live
 * at the root, so they push *over* this tab bar instead of inside it.
 */
export default function TabsLayout() {
  // NativeTabs renders through react-native-screens, outside the
  // `ThemeProvider` in app/_layout.tsx, so it inherits no colours: without an
  // explicit backgroundColor Android's Material 3 default paints the bar white
  // regardless of dark mode. Everything is a `global.css` token via
  // `useThemeColor` (these props take strings, not classes).
  const background = useThemeColor('--color-background');
  const foreground = useThemeColor('--color-foreground');
  const accent = useThemeColor('--color-accent');
  const accentTonal = useThemeColor('--color-accent-tonal');
  const accentOnTonal = useThemeColor('--color-accent-on-tonal');
  // Android reads as WhatsApp's bar, in reds: a tonal pill behind the selected
  // glyph and every label shown in the foreground colour.
  // iOS keeps its tint, its selected tab is not a pill.
  const android =
    process.env.EXPO_OS === 'android'
      ? {
          iconColor: { default: foreground, selected: accentOnTonal },
          indicatorColor: accentTonal,
          // Material hides inactive labels past three tabs; WhatsApp labels all four.
          labelVisibilityMode: 'labeled' as const,
          // No bold selected label: Android reads one weight for the whole bar,
          // from the default style only.
          labelStyle: { default: { color: foreground } },
        }
      : {};

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
      backgroundColor={background}
      indicatorColor="rgba(220, 38, 38, 0.18)"
      minimizeBehavior="onScrollDown"
      rippleColor="rgba(220, 38, 38, 0.24)"
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
        listeners={{ tabPress: () => emitTabPress('connect') }}
        name="connect"
      >
        <NativeTabs.Trigger.Icon md="settings" sf="gearshape.fill" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* Search last so it can combine with the platform search affordance.
          `listeners` fires on every tap (active tab or not) — see
          `features/search/focus-signal` for why the search screen needs it.
          Deliberately *not* an `emitTabPress` tab: search has no scroll surface
          to refresh, and re-tapping it already has a meaning (focus the
          field), so a second tap must not be reinterpreted as a double tap. */}
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
