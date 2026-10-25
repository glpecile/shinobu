import Ionicons from '@react-native-vector-icons/ionicons/static';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import {
  measure,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Collapse } from '@/components/collapse';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';
import { useDisclosureToggle } from '@/lib/use-disclosure-toggle';
import {
  setSectionCollapsed,
  useSectionCollapsed,
} from '@/state/prefs/collapsed-sections';

const ScrollContext = createContext<{
  viewport: AnimatedRef<View>;
  scrollY: SharedValue<number>;
  layoutVersion: SharedValue<number>;
} | null>(null);

/** Pins nested section headings within this scroll viewport, including async rows. */
function CollapsibleSectionScroll({ children, ...props }: ComponentProps<typeof RefreshableScrollView>) {
  const viewport = useAnimatedRef<View>();
  const scrollY = useSharedValue(0);
  const layoutVersion = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });

  return (
    <ScrollContext.Provider value={{ viewport, scrollY, layoutVersion }}>
      <AnimatedView className="flex-1" ref={viewport}>
        <RefreshableScrollView {...props} onScroll={onScroll} scrollEventThrottle={16}>
          {children}
        </RefreshableScrollView>
      </AnimatedView>
    </ScrollContext.Provider>
  );
}

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
  const scroll = useContext(ScrollContext);
  const section = useAnimatedRef<View>();
  const sectionHeight = useSharedValue(0);
  const headerHeight = useSharedValue(0);
  const sticky = useAnimatedStyle(() => {
    if (process.env.EXPO_OS === 'web' || !_WORKLET || scroll == null) return {};
    scroll.layoutVersion.get();
    if (scroll.scrollY.get() <= 0) return { transform: [{ translateY: 0 }] };
    // Measure in viewport space: async content and nested Up Next wrappers move sections.
    const frame = measure(section);
    const viewport = measure(scroll.viewport);
    if (frame == null || viewport == null) return {};
    return {
      transform: [{ translateY: Math.max(0, Math.min(viewport.pageY - frame.pageY, sectionHeight.get() - headerHeight.get())) }],
    };
  });
  const collapsed = useSectionCollapsed(collapseKey);
  const toggle = useDisclosureToggle(() =>
    setSectionCollapsed(collapseKey, !collapsed),
  );

  return (
    <AnimatedView
      className="mb-6"
      onLayout={(event) => {
        sectionHeight.set(event.nativeEvent.layout.height);
        if (scroll != null) scroll.layoutVersion.set(scroll.layoutVersion.get() + 1);
      }}
      ref={section}
    >
      {/* Reserves the action's `min-h-11` while collapsed hides it, so the
          header doesn't jump on toggle (matches `SkeletonSectionHeader`). */}
      <AnimatedView
        className={cn('flex-row items-center justify-between px-4 mb-3', action && 'min-h-11', scroll && 'z-10 bg-background web:sticky web:top-0')}
        onLayout={(event) => headerHeight.set(event.nativeEvent.layout.height)}
        style={sticky}
      >
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
      </AnimatedView>
      <Collapse open={!collapsed}>{children}</Collapse>
    </AnimatedView>
  );
}

/** A `leading` glyph for rails without a provider mark, sized like `ProviderIcon size={16}`. */
function CollapsibleSectionIcon({ name }: { name: ComponentProps<typeof Ionicons>['name'] }) {
  return <Ionicons color={useThemeColor('--color-muted')} name={name} size={16} />;
}

CollapsibleSection.Scroll = CollapsibleSectionScroll;
CollapsibleSection.Icon = CollapsibleSectionIcon;
