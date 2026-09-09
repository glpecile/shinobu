import { Navigator } from 'expo-router';
import { View } from 'react-native';

import { usePageEnterStyle } from '@/lib/page-transition';

/**
 * Web has no bottom tab bar — navigation lives in the persistent left sidebar
 * (`components/app-shell`, mounted at the root). This group's layout is a plain
 * passthrough so the tab screens render directly into that shell.
 *
 * It is `<Navigator>` + `Navigator.Slot` rather than `<Slot />` only so the
 * page can be keyed on the focused route: a fresh wrapper per tab switch is
 * what replays the enter blur-fade (`lib/page-transition`). Keying on the
 * navigator's own state, not `usePathname()`, keeps a details push from
 * remounting (and un-scrolling) the tab underneath it.
 */
function TabPage() {
  const { state } = Navigator.useContext();
  const enter = usePageEnterStyle();
  return (
    <View className="flex-1" key={state.routes[state.index].key} style={enter}>
      <Navigator.Slot />
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
