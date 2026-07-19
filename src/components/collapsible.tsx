import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

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
  const muted = useCSSVariable('--color-muted');

  return (
    <View className="border border-border rounded-lg">
      <PresstableOpacity
        className="flex-row items-center gap-2 px-4 py-3"
        onPress={() => setOpen(!open)}
      >
        <Ionicons
          color={typeof muted === 'string' ? muted : undefined}
          name={open ? 'chevron-down' : 'chevron-forward'}
          size={16}
        />
        <Text className="text-foreground font-sans-semibold text-sm flex-1">
          {label}
        </Text>
      </PresstableOpacity>
      {open && <View className="px-4 pb-4">{children}</View>}
    </View>
  );
}
