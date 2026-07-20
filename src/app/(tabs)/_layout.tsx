import { NativeTabs } from 'expo-router/unstable-native-tabs';

/**
 * Native bottom tab bar for iOS/Android — liquid glass on iOS 26, Material 3
 * on Android. Web takes a different idiom entirely (a left sidebar); see
 * `_layout.web.tsx` + `components/app-shell`. Detail/person/studio routes live
 * at the root, so they push *over* this tab bar instead of inside it.
 */
export default function TabsLayout() {
  return (
    // Vampiric Crimson selected tint (plan.md 1.1) — the brand accent, matching
    // `--color-accent` in global.css.
    <NativeTabs minimizeBehavior="onScrollDown" tintColor="#DC2626">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon md="home" sf="house.fill" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="connect">
        <NativeTabs.Trigger.Icon md="settings" sf="gearshape.fill" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* Search last so it can combine with the platform search affordance. */}
      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Icon md="search" sf="magnifyingglass" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
