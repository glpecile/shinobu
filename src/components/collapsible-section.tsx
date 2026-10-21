import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Collapse } from '@/components/collapse';
import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { useDisclosureToggle } from '@/lib/use-disclosure-toggle';
import {
  setSectionCollapsed,
  useSectionCollapsed,
} from '@/state/prefs/collapsed-sections';

/** A persisted feed disclosure. Header actions stay outside the toggle target. */
export function CollapsibleSection({
  title,
  collapseKey,
  leading,
  action,
  children,
}: {
  title: string;
  collapseKey: string;
  leading?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const collapsed = useSectionCollapsed(collapseKey);
  const toggle = useDisclosureToggle(() =>
    setSectionCollapsed(collapseKey, !collapsed),
  );

  return (
    <View className="mb-6">
      {/* Reserves the action's `min-h-11` while collapsed hides it, so the
          header doesn't jump on toggle (matches `SkeletonSectionHeader`). */}
      <View className={cn('flex-row items-center justify-between px-4 mb-3', action && 'min-h-11')}>
        <PresstableOpacity
          accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          className="flex-row items-center gap-2 shrink"
          onPress={toggle}
          pressBehavior="immediate"
        >
          {leading}
          <Text className="text-xl font-display text-foreground shrink" numberOfLines={1}>
            {title}
          </Text>
          <DisclosureChevron open={!collapsed} size={18} />
        </PresstableOpacity>
        {!collapsed && action}
      </View>
      <Collapse open={!collapsed}>{children}</Collapse>
    </View>
  );
}
