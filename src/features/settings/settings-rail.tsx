import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import {
  makeMutable,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedView } from '@/components/animated-view';
import { Eyebrow } from '@/components/eyebrow';
import { PresstableOpacity } from '@/components/presstable';
import { RAIL_LINE, RAIL_W, RailHead } from '@/components/rail-head';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

type IconName = ComponentProps<typeof Ionicons>['name'];
/** Where a titled section sits in the scroll content, and its glyph, for the index. */
type Placement = { y: number; icon: IconName };

const OpenContext = createContext<{ open: boolean; toggle: () => void }>({
  open: true,
  toggle: () => undefined,
});

const ScrollContext = createContext<{
  scrollY: SharedValue<number>;
  place: (title: string, placement: Placement | null) => void;
  /** The section whose title is pinned, for the index's highlight. */
  pin: (title: string) => void;
}>({ scrollY: makeMutable(0), place: () => undefined, pin: () => undefined });

/**
 * How far into a section the scroll must be before its title pins: the head
 * (`RailHead` row, 64px) has all but left the top, the threshold Diary uses
 * when it pins a day only once its head has scrolled out.
 */
const HEAD_PASSED = 48;

/** The width that fits the content column and the "On this page" index beside it. */
const INDEX_MIN_WIDTH = 1024;

/**
 * Settings on the diary's rail: each section is a rail head with its glyph on
 * the line, folding its rows the way a diary day does. Inside a
 * `SettingsRail.Scroll`, a section given `title` and `count` pins them under
 * the header once its head scrolls away, and lists itself in the wide-web index.
 *
 * ```tsx
 * <SettingsRail.Section title="Trackers" count="2 of 5 connected" icon="link-outline">
 *   <SettingsRail.Head label="Trackers, 2 of 5 connected">
 *     <RailHead.Icon name="link-outline">Trackers</RailHead.Icon>
 *     <RailHead.Count>2 of 5 connected</RailHead.Count>
 *   </SettingsRail.Head>
 *   <SettingsRail.Row>
 *     <SettingsRail.Lead><ProviderIcon id="simkl" size={22} /></SettingsRail.Lead>
 *     <SettingsRail.Text>
 *       <SettingsRail.Title>Simkl</SettingsRail.Title>
 *       <SettingsRail.Subtitle>gian</SettingsRail.Subtitle>
 *     </SettingsRail.Text>
 *     <Button … />
 *   </SettingsRail.Row>
 * </SettingsRail.Section>
 * ```
 */
function SettingsRailSection({
  children,
  title,
  count,
  icon,
}: {
  children: ReactNode;
  title: string;
  count: string;
  /** The head's glyph again, for the wide-web index. */
  icon: IconName;
}) {
  const [open, setOpen] = useState(true);
  const { scrollY, place } = useContext(ScrollContext);
  const top = useSharedValue(0);
  const height = useSharedValue(0);

  // The index drops a section that stops rendering (the last hidden item shown again).
  useEffect(() => {
    return () => place(title, null);
  }, [place, title]);

  return (
    <OpenContext.Provider value={{ open, toggle: () => setOpen(!open) }}>
      <View
        onLayout={(event) => {
          const { y, height: sectionHeight } = event.nativeEvent.layout;
          top.set(y);
          height.set(sectionHeight);
          place(title, { y, icon });
        }}
      >
        {children}
        <SettingsRailPinned count={count} height={height} scrollY={scrollY} title={title} top={top} />
      </View>
    </OpenContext.Provider>
  );
}

/**
 * The section's title and count held at the top of the viewport while its rows
 * scroll under it, the Diary's `DiaryStickyDate` look. It lives inside the
 * section and follows the scroll on the UI thread, so it covers rows without
 * moving them, and leaves with the section's last row instead of overlapping
 * the next head. React only hears about it when it pins or unpins.
 */
function SettingsRailPinned({
  title,
  count,
  scrollY,
  top,
  height,
}: {
  title: string;
  count: string;
  scrollY: SharedValue<number>;
  top: SharedValue<number>;
  height: SharedValue<number>;
}) {
  const { pin } = useContext(ScrollContext);
  const reduceMotion = useReducedMotion();
  const barHeight = useSharedValue(0);
  const [visible, setVisible] = useState(false);

  function handlePin(next: boolean) {
    setVisible(next);
    if (next) pin(title);
  }

  useAnimatedReaction(
    () => {
      const into = scrollY.get() - top.get();
      return into > HEAD_PASSED && into < height.get() - barHeight.get();
    },
    (pinned, wasPinned) => {
      if (pinned !== wasPinned) scheduleOnRN(handlePin, pinned);
    },
  );

  const follow = useAnimatedStyle(() => ({
    transform: [
      { translateY: Math.max(0, Math.min(scrollY.get() - top.get(), height.get() - barHeight.get())) },
    ],
  }));

  return (
    <AnimatedView
      accessibilityElementsHidden={!visible}
      className="absolute top-0 left-0 right-0"
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      onLayout={(event) => barHeight.set(event.nativeEvent.layout.height)}
      style={[follow, { pointerEvents: 'none' }]}
    >
      <AnimatedView
        accessibilityRole="header"
        className="flex-row items-baseline px-6 py-2 bg-background border-b border-border"
        style={{
          opacity: visible ? 1 : 0,
          transform: [{ translateY: visible ? 0 : -6 }],
          transitionProperty: ['opacity', 'transform'],
          transitionDuration: reduceMotion ? 0 : visible ? DURATION.enter : DURATION.exit,
          transitionTimingFunction: EASE_OUT,
        }}
      >
        <Text className="font-display text-base text-foreground">{title}</Text>
        <Text className="ml-3 shrink text-muted font-sans text-xs" numberOfLines={1}>
          {count}
        </Text>
      </AnimatedView>
    </AnimatedView>
  );
}

/**
 * The screen's scroll, feeding the sections' pinned titles. Put the sections
 * in one column `View` as its first child, so their layout offsets are scroll
 * offsets. Wide web adds an "On this page" index beside it.
 */
function SettingsRailScroll({ children, ...props }: ComponentProps<typeof RefreshableScrollView>) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useSharedValue(0);
  const [offsets, setOffsets] = useState<Record<string, Placement>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const showIndex = process.env.EXPO_OS === 'web' && width >= INDEX_MIN_WIDTH;

  useAnimatedReaction(
    () => scrollY.get() <= HEAD_PASSED,
    (atTop) => { if (atTop) scheduleOnRN(setCurrent, null); },
  );

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });

  // Created once, so a section's unmount cleanup (which depends on it) runs
  // only when the section actually leaves, not on every render of this scroll.
  const [place] = useState(() => (title: string, placement: Placement | null) => {
    setOffsets((previous) => {
      if (placement == null) {
        if (!(title in previous)) return previous;
        const { [title]: _removed, ...rest } = previous;
        return rest;
      }
      if (previous[title]?.y === placement.y && previous[title]?.icon === placement.icon) return previous;
      return { ...previous, [title]: placement };
    });
  });
  const muted = useThemeColor('--color-muted');
  const foreground = useThemeColor('--color-foreground');

  const sections = Object.entries(offsets).sort(([, a], [, b]) => a.y - b.y);
  const active = current != null && current in offsets ? current : sections[0]?.[0];

  return (
    <ScrollContext.Provider value={{ scrollY, place, pin: setCurrent }}>
      <View className="flex-1 flex-row">
        <RefreshableScrollView
          {...props}
          onScroll={onScroll}
          ref={scrollRef}
          scrollEventThrottle={16}
        >
          {children}
        </RefreshableScrollView>
        {showIndex && (
          // Diary's side-calendar column: same width and edge, so the two tabs line up.
          <View className="w-104 px-6 pt-5 border-l border-border">
            <Eyebrow className="mb-3">On this page</Eyebrow>
            {sections.map(([title, { y, icon }]) => (
              <PresstableOpacity
                accessibilityLabel={`Jump to ${title}`}
                // Not "link": any role but button kills pressto's onPress on web
                // (docs/solutions/web-pressto-accessibility-role-kills-onpress.md).
                accessibilityRole="button"
                accessibilityState={{ selected: title === active }}
                className="flex-row items-center gap-3 py-2 min-h-11 web:focus-visible:outline-2 web:focus-visible:outline-foreground web:focus-visible:outline-offset-2"
                key={title}
                onPress={() => {
                  setCurrent(title);
                  scrollRef.current?.scrollTo({ y, animated: !reduceMotion });
                }}
              >
                <Ionicons color={title === active ? foreground : muted} name={icon} size={16} />
                <Text
                  className={cn(
                    'text-sm',
                    title === active ? 'text-foreground font-sans-semibold' : 'text-muted font-sans',
                  )}
                >
                  {title}
                </Text>
              </PresstableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollContext.Provider>
  );
}

/** The section's fold toggle; compose `RailHead.Icon` and `RailHead.Count` inside. */
function SettingsRailHead({ label, children }: { label: string; children: ReactNode }) {
  const { open, toggle } = useContext(OpenContext);
  return (
    <RailHead label={label} onToggle={toggle} open={open}>
      {children}
    </RailHead>
  );
}

/**
 * One row on the rail, omitted while its section is folded. A row that opens
 * something wraps its lead and text in `SettingsRail.Target`, leaving any
 * trailing button outside it (a button can't sit inside another on web).
 */
function SettingsRailRow({
  children,
  dimmed = false,
}: {
  children: ReactNode;
  /** Rows a parent switch has turned off, still shown so the switch has context. */
  dimmed?: boolean;
}) {
  const { open } = useContext(OpenContext);
  if (!open) return null;
  return (
    <View className="flex-row">
      <View className={cn(RAIL_W, 'relative')}>
        <View className={cn('absolute w-px bg-border top-0 bottom-0', RAIL_LINE)} />
      </View>
      <View className={cn('flex-1 min-w-0 flex-row items-center gap-3 py-2.5 pr-6 min-h-16', dimmed && 'opacity-50')}>
        {children}
      </View>
    </View>
  );
}

/** The pressable part of a row: its lead and text, stretched to the trailing button. */
function SettingsRailTarget({
  children,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <PresstableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="flex-1 min-w-0 flex-row items-center gap-3 self-stretch"
      onPress={onPress}
    >
      {children}
    </PresstableOpacity>
  );
}

/** A fixed-width slot for the row's glyph or provider mark, so titles align down the section. */
function SettingsRailLead({ children }: { children: ReactNode }) {
  return <View className="w-9 shrink-0 items-center">{children}</View>;
}

function SettingsRailText({ children }: { children: ReactNode }) {
  return <View className="flex-1 min-w-0">{children}</View>;
}

function SettingsRailTitle({ children }: { children: ReactNode }) {
  return (
    <Text className="text-foreground font-sans-semibold text-base" numberOfLines={1}>
      {children}
    </Text>
  );
}

/** One line by default; give an instruction the user has to act on two. */
function SettingsRailSubtitle({ children, lines = 1 }: { children: ReactNode; lines?: 1 | 2 }) {
  return (
    <Text className="text-muted font-sans text-xs mt-0.5" numberOfLines={lines}>
      {children}
    </Text>
  );
}

export const SettingsRail = {
  Scroll: SettingsRailScroll,
  Section: SettingsRailSection,
  Head: SettingsRailHead,
  Row: SettingsRailRow,
  Target: SettingsRailTarget,
  Lead: SettingsRailLead,
  Text: SettingsRailText,
  Title: SettingsRailTitle,
  Subtitle: SettingsRailSubtitle,
};
