import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';
import {
  setSectionCollapsed,
  useSectionCollapsed,
} from '@/state/prefs/collapsed-sections';

/**
 * A collapsible Up Next sub-section header, mirroring `media-carousel`'s (same
 * chevron, same persisted-collapse contract, same accessibility shape) without
 * dragging a media-item list through it.
 *
 * The chevron *rotates* rather than swapping `chevron-down` for `chevron-up`:
 * a glyph swap is a hard cut between two shapes, while one arrow turning over
 * shows the toggle as a single reversible thing. It's the one part of collapse
 * that's cheap to animate — the body itself is deliberately not animated. RN
 * has no `height: auto` interpolation, so an expand would mean measuring the
 * children and driving a numeric height, which is a layout-thrashing animation
 * (never just transform/opacity) on a control that gets hit repeatedly. Popping
 * open instantly beats a janky reveal.
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
  const reduceMotion = useReducedMotion();

  return (
    <View className="mb-6">
      <PresstableOpacity
        accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
        accessibilityState={{ expanded: !collapsed }}
        className="flex-row items-center gap-2 self-start px-4 mb-3"
        onPress={() => setSectionCollapsed(collapseKey, !collapsed)}
      >
        <Text className="text-xl font-display text-foreground">{title}</Text>
        {/* Declarative Reanimated CSS transition, not a shared value: the
            rotation is pure derived-from-props state, so there's no imperative
            lifecycle to own. Rotation is movement, so reduced motion snaps it. */}
        <AnimatedView
          style={{
            transform: [{ rotate: collapsed ? '0deg' : '180deg' }],
            transitionProperty: 'transform',
            transitionDuration: reduceMotion ? 0 : DURATION.toggle,
            transitionTimingFunction: EASE_IN_OUT,
          }}
        >
          <Ionicons
            color={typeof muted === 'string' ? muted : undefined}
            name="chevron-down"
            size={18}
          />
        </AnimatedView>
      </PresstableOpacity>
      {!collapsed && children}
    </View>
  );
}
