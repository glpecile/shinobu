import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PresstableOpacity } from '@/components/presstable';

/**
 * Disclosure for secondary content (how-to instructions, fine print): a
 * chevron header that toggles its children, collapsed by default.
 */
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
        className="flex-row items-center gap-2 px-4 py-3"
        onPress={() => setOpen(!open)}
      >
        <DisclosureChevron from="forward" open={open} size={16} />
        <Text className="text-foreground font-sans-semibold text-sm flex-1">
          {label}
        </Text>
      </PresstableOpacity>
      {open && <View className="px-4 pb-4">{children}</View>}
    </View>
  );
}
