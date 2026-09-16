import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PresstableOpacity } from '@/components/presstable';
import {
  setSectionCollapsed,
  useSectionCollapsed,
} from '@/state/prefs/collapsed-sections';

/**
 * A collapsible Up Next sub-section header, mirroring `media-carousel`'s (same
 * chevron, same persisted-collapse contract, same accessibility shape) without
 * dragging a media-item list through it.
 *
 * The body pops open without animating: RN has no `height: auto`
 * interpolation, so a reveal would mean driving a measured numeric height on a
 * control that gets hit repeatedly.
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

  return (
    <View className="mb-6">
      <PresstableOpacity
        accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
        accessibilityState={{ expanded: !collapsed }}
        className="flex-row items-center gap-2 self-start px-4 mb-3"
        onPress={() => setSectionCollapsed(collapseKey, !collapsed)}
      >
        <Text className="text-xl font-display text-foreground">{title}</Text>
        <DisclosureChevron open={!collapsed} size={18} />
      </PresstableOpacity>
      {!collapsed && children}
    </View>
  );
}
