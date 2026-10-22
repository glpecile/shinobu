import { Navigator } from 'expo-router';
import { View } from 'react-native';

/**
 * Web has no bottom tab bar — navigation lives in the persistent left sidebar
 * (`components/app-shell`, mounted at the root). This group's layout is a plain
 * passthrough so the tab screens render directly into that shell.
 *
 * It is `<Navigator>` + `Navigator.Slot` rather than `<Slot />` only so the
 * page can be keyed on the focused route. Keying on the navigator's own
 * state, not `usePathname()`, keeps a details push from
 * remounting (and un-scrolling) the tab underneath it.
 */
function TabPage() {
  const { state, NavigationContent } = Navigator.useContext();
  return (
    <View className="flex-1" key={state.routes[state.index].key}>
      {/* `Navigator.Slot` alone never reports its screen focused, so every tab's
          `<Head>` stayed unmounted (docs/solutions/web-tab-titles-never-set.md). */}
      <NavigationContent>
        <Navigator.Slot />
      </NavigationContent>
    </View>
  );
}

export default function TabsWebLayout() {
  return (
    <Navigator>
      <TabPage />
    </Navigator>
  );
}
