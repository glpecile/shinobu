import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Collapse } from '@/components/collapse';
import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PresstableOpacity } from '@/components/presstable';

export function Collapsible({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View className="border border-border rounded-lg">
      <PresstableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-2 px-4 py-3"
        onPress={() => setOpen(!open)}
        pressBehavior="immediate"
      >
        <DisclosureChevron from="forward" open={open} size={16} />
        <Text className="text-foreground font-sans-semibold text-sm flex-1">
          {label}
        </Text>
      </PresstableOpacity>
      <Collapse open={open}>
        <View className="px-4 pb-4">{children}</View>
      </Collapse>
    </View>
  );
}
