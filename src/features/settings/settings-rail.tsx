import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, View, type ScrollViewInstance } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';
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
type Placement = { y: number; icon: IconName };

const OpenContext = createContext<{ open: boolean; toggle: () => void }>({
  open: true,
  toggle: () => undefined,
});

const ScrollContext = createContext<{
  scrollY: SharedValue<number>;
  place: (title: string, placement: Placement | null) => void;
  pin: (title: string) => void;
}>({ scrollY: makeMutable(0), place: () => undefined, pin: () => undefined });

const HEAD_PASSED = 48;

const INDEX_MIN_WIDTH = 1024;

function SettingsRailSection({
  children,
  title,
  count,
  icon,
}: {
  children: ReactNode;
  title: string;
  count: string;
  icon: IconName;
}) {
  const [open, setOpen] = useState(true);
  const { scrollY, place } = useContext(ScrollContext);
  const top = useSharedValue(0);
  const height = useSharedValue(0);

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
        <SettingsRailPinned
          count={count}
          height={height}
          icon={icon}
          scrollY={scrollY}
          title={title}
          top={top}
        />
      </View>
    </OpenContext.Provider>
  );
}

function SettingsRailPinned({
  title,
  count,
  icon,
  scrollY,
  top,
  height,
}: {
  title: string;
  count: string;
  icon: IconName;
  scrollY: SharedValue<number>;
  top: SharedValue<number>;
  height: SharedValue<number>;
}) {
  const { pin } = useContext(ScrollContext);
  const reduceMotion = useReducedMotion();
  const barHeight = useSharedValue(0);
  const [visible, setVisible] = useState(false);
  const muted = useThemeColor('--color-muted');

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

  // Web pins with CSS sticky inside a section-tall track instead: Firefox
  // scrolls on the compositor, so a transform set from JS lands frames behind
  // the content and the bar judders.
  const follow = useAnimatedStyle(() =>
    process.env.EXPO_OS === 'web'
      ? {}
      : {
          transform: [
            {
              translateY: Math.max(
                0,
                Math.min(scrollY.get() - top.get(), height.get() - barHeight.get()),
              ),
            },
          ],
        },
  );

  return (
    <AnimatedView
      accessibilityElementsHidden={!visible}
      className="absolute top-0 left-0 right-0 web:bottom-0"
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[follow, { pointerEvents: 'none' }]}
    >
      <AnimatedView
        accessibilityRole="header"
        className="flex-row items-center gap-2 px-6 py-2 bg-background border-b border-border web:sticky web:top-0"
        onLayout={(event) => barHeight.set(event.nativeEvent.layout.height)}
        style={{
          opacity: visible ? 1 : 0,
          transform: [{ translateY: visible ? 0 : -6 }],
          transitionProperty: ['opacity', 'transform'],
          transitionDuration: reduceMotion ? 0 : visible ? DURATION.enter : DURATION.exit,
          transitionTimingFunction: EASE_OUT,
        }}
      >
        <Ionicons color={muted} name={icon} size={16} />
        <Text className="font-display text-base text-foreground">{title}</Text>
        <Text className="ml-1 shrink text-muted font-sans text-xs tabular-nums" numberOfLines={1}>
          {count}
        </Text>
      </AnimatedView>
    </AnimatedView>
  );
}

/** Put sections in one column `View` as the first child so `onLayout` `y` matches scroll offsets. */
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
    (atTop, wasAtTop) => {
      if (atTop && wasAtTop !== true) scheduleOnRN(setCurrent, null);
    },
  );

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });

  const [place] = useState(() => (title: string, placement: Placement | null) => {
    setOffsets((previous) => {
      if (placement == null) {
        if (!(title in previous)) return previous;
        return Object.fromEntries(Object.entries(previous).filter(([key]) => key !== title));
      }
      if (previous[title]?.y === placement.y && previous[title]?.icon === placement.icon)
        return previous;
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
          <View className="w-104 px-6 pt-5 border-l border-border">
            <Eyebrow className="mb-3">On this page</Eyebrow>
            {sections.map(([title, { y, icon }]) => (
              <PresstableOpacity
                accessibilityLabel={`Jump to ${title}`}
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
                    'font-sans text-sm',
                    title === active ? 'text-foreground' : 'text-muted',
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

function SettingsRailHead({ label, children }: { label: string; children: ReactNode }) {
  const { open, toggle } = useContext(OpenContext);
  return (
    <RailHead label={label} onToggle={toggle} open={open}>
      {children}
    </RailHead>
  );
}

/** Put trailing buttons outside `SettingsRail.Target`; HTML forbids nested buttons on web. */
function SettingsRailRow({ children, dimmed = false }: { children: ReactNode; dimmed?: boolean }) {
  const { open } = useContext(OpenContext);
  if (!open) return null;
  return (
    <View className="flex-row">
      <View className={cn(RAIL_W, 'relative')}>
        <View className={cn('absolute w-px bg-border top-0 bottom-0', RAIL_LINE)} />
      </View>
      <View
        className={cn(
          'flex-1 min-w-0 flex-row items-center gap-3 py-2.5 pr-6 min-h-16',
          dimmed && 'opacity-50',
        )}
      >
        {children}
      </View>
    </View>
  );
}

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
