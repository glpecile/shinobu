import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import {
  setSectionCollapsed,
  useSectionCollapsed,
} from '@/state/prefs/collapsed-sections';

/**
 * A collapsible Up Next sub-section header, mirroring `media-carousel`'s (same
 * chevron, same persisted-collapse contract, same accessibility shape) without
 * dragging a media-item list through it.
 */
export function UpNextSectionHeader({
  title,
  collapseKey,
  children,
}: {
  title: string;
  collapseKey: string;
  children: ReactNode;
}) {
  const collapsed = useSectionCollapsed(collapseKey);
  const muted = useCSSVariable('--color-muted');

  return (
    <View className="mb-6">
      <PresstableOpacity
        accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
        accessibilityState={{ expanded: !collapsed }}
        className="flex-row items-center gap-2 self-start px-4 mb-3"
        onPress={() => setSectionCollapsed(collapseKey, !collapsed)}
      >
        <Text className="text-xl font-display text-foreground">{title}</Text>
        <Ionicons
          color={typeof muted === 'string' ? muted : undefined}
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={18}
        />
      </PresstableOpacity>
      {!collapsed && children}
    </View>
  );
}
