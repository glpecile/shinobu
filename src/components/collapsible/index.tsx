import { Collapsible as NativeCollapsible, Host, RNHostView } from '@expo/ui';
import { useState, type ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';

import { useThemeColor } from '@/lib/theme-color';

/** Native disclosure for connection instructions inside the setup sheet. */
export function Collapsible({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const scheme = useColorScheme();
  const accent = useThemeColor('--color-accent');
  const foreground = useThemeColor('--color-foreground');

  return (
    <View className="border border-border rounded-lg overflow-hidden">
      <Host
        colorScheme={scheme}
        matchContents={{ vertical: true }}
        seedColor={accent}
        style={{ width: '100%' }}
      >
        <NativeCollapsible
          isOpen={open}
          label={label}
          labelStyle={{ color: foreground, fontSize: 14 }}
          onOpenChange={setOpen}
        >
          <RNHostView matchContents>
            <View className="w-full">{children}</View>
          </RNHostView>
        </NativeCollapsible>
      </Host>
    </View>
  );
}
