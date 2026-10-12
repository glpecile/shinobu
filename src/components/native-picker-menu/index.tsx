import { MenuView } from '@expo/ui/community/menu';
import { useColorScheme, View } from 'react-native';

import { haptics } from '@/lib/haptics';

import type { NativePickerMenuProps } from './types';

/** The native menu owns presses; the wrapped button is only its visual label. */
export function NativePickerMenu<T extends string | number | null>({
  title,
  value,
  options,
  onSelect,
  children,
}: NativePickerMenuProps<T>) {
  const scheme = useColorScheme();
  return (
    <MenuView
      actions={options.map((option, index) => ({
        id: String(index),
        title: option.label,
        state: option.value === value ? 'on' : 'off',
      }))}
      colorScheme={scheme}
      onPressAction={({ nativeEvent }) => {
        const option = options[Number(nativeEvent.event)];
        if (option == null || option.value === value) return;
        haptics.selection();
        onSelect(option.value);
      }}
      title={title}
    >
      <View className="pointer-events-none">{children}</View>
    </MenuView>
  );
}
