import { Host, Image, Picker } from '@expo/ui/swift-ui';
import { accessibilityLabel, controlSize, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useColorScheme } from 'react-native';

import { haptics } from '@/lib/haptics';
import type { ViewToggleProps } from './props';

/** Grid ⇄ list as SwiftUI's segmented `Picker`. */
export function ViewToggle({ view, onChange, size }: ViewToggleProps) {
  const scheme = useColorScheme();
  return (
    <Host
      matchContents
      {...(scheme === 'light' || scheme === 'dark' ? { colorScheme: scheme } : {})}
    >
      <Picker
        modifiers={[pickerStyle('segmented'), controlSize(size === 'sm' ? 'small' : 'regular')]}
        onSelectionChange={(next: ViewToggleProps['view']) => {
          if (next === view) return;
          haptics.selection();
          onChange(next);
        }}
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
