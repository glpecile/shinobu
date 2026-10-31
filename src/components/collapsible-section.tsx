import Ionicons from '@react-native-vector-icons/ionicons/static';
import { createContext, useContext, useRef, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { Text, View, type ViewInstance } from 'react-native';
import {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedView, GestureScrollView } from '@/components/animated-view';
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
  content: RefObject<ViewInstance | null>;
  /** The content wrapper's offset in the scroll content, i.e. the container's top padding. */
  contentY: SharedValue<number>;
  scrollY: SharedValue<number>;
  layoutVersion: SharedValue<number>;
} | null>(null);

/** Pins nested section headings within this scroll viewport, including async rows. */
function CollapsibleSectionScroll({
  children,
  onRefresh,
  ...props
}: Omit<ComponentProps<typeof RefreshableScrollView>, 'onScroll' | 'scrollEventThrottle' | 'onRefresh'> & {
  onRefresh?: () => Promise<unknown>;
}) {
  const content = useRef<ViewInstance>(null);
  const contentY = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const layoutVersion = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  const scrollProps = {
    ...props,
    // Firefox scrolls on the compositor; web headings use CSS sticky instead.
    onScroll: process.env.EXPO_OS === 'web' ? undefined : onScroll,
    scrollEventThrottle: 16,
  };
  const contentView = (
    // A row loading or unmounting above a nested section moves it without its own onLayout.
    <View
      onLayout={(event) => {
        contentY.set(event.nativeEvent.layout.y);
        layoutVersion.set(layoutVersion.get() + 1);
      }}
      ref={content}
    >
      {children}
    </View>
  );

  return (
    <ScrollContext.Provider value={{ content, contentY, scrollY, layoutVersion }}>
      {onRefresh == null ? (
        <GestureScrollView {...scrollProps}>{contentView}</GestureScrollView>
      ) : (
        <RefreshableScrollView {...scrollProps} onRefresh={onRefresh}>{contentView}</RefreshableScrollView>
      )}
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
  // Worklets capture these instead of `scroll`: a capture is copied to the UI thread, and the `content` view ref can't be.
  const scrollY = scroll?.scrollY;
  const contentY = scroll?.contentY;
  const layoutVersion = scroll?.layoutVersion;
  const section = useRef<ViewInstance>(null);
  // Unpinned until measured.
  const top = useSharedValue(Number.POSITIVE_INFINITY);
  const sectionHeight = useSharedValue(0);
  const headerHeight = useSharedValue(0);

  function measureTop() {
    if (process.env.EXPO_OS === 'web' || scroll?.content.current == null) return;
    section.current?.measureLayout(scroll.content.current, (_x, y, _width, height) => {
      // A screen parked under a pushed one lays out at zero; keep the last offset.
      if (height > 0) top.set(y);
    });
  }

  useAnimatedReaction(
    () => layoutVersion?.get(),
    () => scheduleOnRN(measureTop),
  );

  const sticky = useAnimatedStyle(() => {
    if (!_WORKLET || scrollY == null || contentY == null) return {};
    return {
      transform: [{ translateY: Math.max(0, Math.min(scrollY.get() - contentY.get() - top.get(), sectionHeight.get() - headerHeight.get())) }],
    };
  });
  const collapsed = useSectionCollapsed(collapseKey);
  const toggle = useDisclosureToggle(() =>
    setSectionCollapsed(collapseKey, !collapsed),
  );

  return (
    <View
      className="mb-6"
      onLayout={(event) => sectionHeight.set(event.nativeEvent.layout.height)}
      ref={section}
    >
      {/* Pinned, padding instead of margin lets the background cover the gap
          around the title; the negative margin keeps the unpinned layout. */}
      <AnimatedView
        className={cn('flex-row items-center justify-between px-4 mb-3', scroll && 'z-10 mb-0 pb-3 bg-background web:sticky web:top-0 web:-mt-3 web:pt-3')}
        onLayout={(event) => headerHeight.set(event.nativeEvent.layout.height)}
        style={sticky}
      >
        {/* Reserves the action's `min-h-11` while collapsed hides it, so the
            header doesn't jump on toggle (matches `SkeletonSectionHeader`). */}
        <PresstableOpacity
          accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          className={cn('flex-row items-center gap-2 shrink', action && 'min-h-11')}
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
    </View>
  );
}

/** A `leading` glyph for rails without a provider mark, sized like `ProviderIcon size={16}`. */
function CollapsibleSectionIcon({ name }: { name: ComponentProps<typeof Ionicons>['name'] }) {
  return <Ionicons color={useThemeColor('--color-muted')} name={name} size={16} />;
}

CollapsibleSection.Scroll = CollapsibleSectionScroll;
CollapsibleSection.Icon = CollapsibleSectionIcon;
