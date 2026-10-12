import {
  DropdownMenu,
  DropdownMenuItem,
  Host,
  RNHostView,
  Text,
} from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { useColorScheme, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { haptics } from '@/lib/haptics';

import type { NativePickerMenuProps } from './types';

/** Compose's leading slot can host the same full-color logos as the app. */
export function NativePickerMenu<T extends string | number | null>({
  title,
  value,
  options,
  onSelect,
  children,
}: NativePickerMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const scheme = useColorScheme();

  return (
    <Host colorScheme={scheme} matchContents>
      <DropdownMenu expanded={open} onDismissRequest={() => setOpen(false)}>
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            <PresstableOpacity
              accessibilityLabel={`${title}: ${options.find((option) => option.value === value)?.label ?? ''}`}
              accessibilityRole="button"
              className="min-h-11 justify-center"
              onPress={() => setOpen(true)}
            >
              <View className="pointer-events-none" importantForAccessibility="no-hide-descendants">
                {children}
              </View>
            </PresstableOpacity>
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {options.map((option, index) => (
            <DropdownMenuItem
              key={index}
              onClick={() => {
                setOpen(false);
                if (option.value === value) return;
                haptics.selection();
                onSelect(option.value);
              }}
            >
              {option.icon != null && (
                <DropdownMenuItem.LeadingIcon>
                  <RNHostView matchContents>
                    <View>{option.icon}</View>
                  </RNHostView>
                </DropdownMenuItem.LeadingIcon>
              )}
              <DropdownMenuItem.Text>
                <Text>{option.label}</Text>
              </DropdownMenuItem.Text>
              {option.value === value && (
                <DropdownMenuItem.TrailingIcon>
                  <Text>✓</Text>
                </DropdownMenuItem.TrailingIcon>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}
