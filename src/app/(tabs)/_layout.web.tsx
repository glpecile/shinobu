import { Navigator } from 'expo-router';
import { View } from 'react-native';

// Key on navigator route state rather than usePathname() so pushing a root detail route doesn't remount the tab.
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
