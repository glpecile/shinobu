import { Host, Image, Picker } from '@expo/ui/swift-ui';
import { accessibilityLabel, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useColorScheme } from 'react-native';

import type { WatchlistView } from '@/state/prefs/watchlist-view';

/** Grid ⇄ list as SwiftUI's segmented `Picker`. */
export function ViewToggle({
  view,
  onChange,
}: {
  view: WatchlistView;
  onChange: (view: WatchlistView) => void;
}) {
  const scheme = useColorScheme();
  return (
    <Host
      matchContents
      {...(scheme === 'light' || scheme === 'dark' ? { colorScheme: scheme } : {})}
    >
      <Picker
        modifiers={[pickerStyle('segmented')]}
        onSelectionChange={(next: WatchlistView) => onChange(next)}
        selection={view}
      >
        <Image
          modifiers={[tag('grid'), accessibilityLabel('Poster grid')]}
          systemName="square.grid.2x2"
        />
        <Image modifiers={[tag('list'), accessibilityLabel('List')]} systemName="list.bullet" />
      </Picker>
    </Host>
  );
}
