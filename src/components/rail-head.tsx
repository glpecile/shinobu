import Ionicons from '@react-native-vector-icons/ionicons/static';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { DisclosureChevron } from '@/components/disclosure-chevron';
import { PresstableOpacity } from '@/components/presstable';
import { Skeleton } from '@/components/skeleton';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

export const RAIL_W = 'w-14';
export const RAIL_LINE = 'left-7';

const ROW = 'flex-row pt-5';
const TRAILING = 'flex-1 min-w-0 flex-row items-center pr-6 pb-3';
const RULE = 'flex-1 h-px bg-border';
const LEAD_LINE = cn('absolute w-px bg-border bottom-0', RAIL_LINE);

const OpenContext = createContext(true);

type IconName = ComponentProps<typeof Ionicons>['name'];

export function RailHead({
  open,
  onToggle,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <PresstableOpacity
      accessibilityHint={open ? 'Hides these rows' : 'Shows these rows'}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      className={ROW}
      onPress={onToggle}
      pressBehavior="immediate"
    >
      <OpenContext.Provider value={open}>{children}</OpenContext.Provider>
    </PresstableOpacity>
  );
}

function RailHeadDate({
  day,
  label,
  today = false,
}: {
  day: string;
  label: string;
  today?: boolean;
}) {
  const open = useContext(OpenContext);
  return (
    <View className={cn(RAIL_W, 'shrink-0 items-center relative')}>
      <Text
        className={cn(
          'font-display text-2xl leading-none',
          today ? 'text-accent' : 'text-foreground',
        )}
      >
        {day}
      </Text>
      <Text className="text-muted font-sans-semibold text-[9px] uppercase tracking-widest mt-1">
        {label}
      </Text>
      {open && <View className={cn(LEAD_LINE, 'top-11')} />}
    </View>
  );
}

function RailHeadTitle({ children, muted = false, showRail = true }: { children: ReactNode; muted?: boolean; showRail?: boolean }) {
  const open = useContext(OpenContext);
  return (
    <View className="relative pl-6 pr-2 pb-3">
      <Text
        className={cn(
          'font-display text-xl leading-none',
          muted ? 'text-muted' : 'text-foreground',
        )}
      >
        {children}
      </Text>
      {open && showRail && <View className={cn(LEAD_LINE, 'top-5')} />}
    </View>
  );
}

function RailHeadIcon({ name, children, showRail = true }: { name: IconName; children: ReactNode; showRail?: boolean }) {
  const open = useContext(OpenContext);
  const muted = useThemeColor('--color-muted');
  return (
    <View className="relative flex-row items-center pb-3">
      <View className={cn(RAIL_W, 'items-center')}>
        <View className="w-8 h-8 rounded-full bg-background border border-border items-center justify-center">
          <Ionicons color={muted} name={name} size={16} />
        </View>
      </View>
      <Text className="font-display text-xl leading-none text-foreground pr-2">{children}</Text>
      {open && showRail && <View className={cn(LEAD_LINE, 'top-8')} />}
    </View>
  );
}

function RailHeadCount({ children }: { children: ReactNode }) {
  const open = useContext(OpenContext);
  return (
    <View className={TRAILING}>
      <Text className="shrink text-muted/70 font-sans text-[11px] mr-3">{children}</Text>
      <View className={RULE} />
      <DisclosureChevron className="ml-2.5" open={open} size={14} />
    </View>
  );
}

function RailHeadSkeleton({
  lead,
  showRail = true,
  animated = true,
}: {
  lead: 'date' | 'title' | 'icon';
  showRail?: boolean;
  animated?: boolean;
}) {
  return (
    <View className={ROW}>
      {lead === 'date' ? (
        <View className={cn(RAIL_W, 'items-center relative')}>
          <Skeleton animated={animated} className="w-7 h-6 rounded" />
          <Skeleton animated={animated} className="w-6 h-3 rounded mt-1" />
          {showRail && <View className={cn(LEAD_LINE, 'top-11')} />}
        </View>
      ) : lead === 'icon' ? (
        <View className="relative flex-row items-center pb-3">
          <View className={cn(RAIL_W, 'items-center')}>
            <Skeleton animated={animated} className="w-8 h-8 rounded-full" />
          </View>
          <Skeleton animated={animated} className="w-24 h-5 rounded mr-2" />
          {showRail && <View className={cn(LEAD_LINE, 'top-8')} />}
        </View>
      ) : (
        <View className="relative pl-6 pr-2 pb-3">
          <Skeleton animated={animated} className="w-10 h-5 rounded" />
          {showRail && <View className={cn(LEAD_LINE, 'top-5')} />}
        </View>
      )}
      <View className={TRAILING}>
        <Skeleton animated={animated} className="h-2.5 w-16 rounded mr-3" />
        <View className={RULE} />
      </View>
    </View>
  );
}

function RailHeadPinned({ title, count, visible, icon }: { title: string; count: string; visible: boolean; icon?: IconName }) {
  const reduceMotion = useReducedMotion();
  const muted = useThemeColor('--color-muted');
  return (
    <AnimatedView
      accessibilityElementsHidden={!visible}
      accessibilityRole="header"
      className={cn(
        'absolute top-0 left-0 right-0 flex-row items-baseline px-6 py-2 bg-background border-b border-border',
        icon != null && 'items-center gap-2',
      )}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={{
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transform: [{ translateY: visible ? 0 : -6 }],
        transitionProperty: ['opacity', 'transform'],
        transitionDuration: reduceMotion ? 0 : visible ? DURATION.enter : DURATION.exit,
        transitionTimingFunction: EASE_OUT,
      }}
    >
      {icon != null && <Ionicons color={muted} name={icon} size={16} />}
      <Text className="font-display text-base text-foreground">{title}</Text>
      <Text className={cn('ml-3 shrink text-muted font-sans text-xs', icon != null && 'ml-1')} numberOfLines={1}>
        {count}
      </Text>
    </AnimatedView>
  );
}

RailHead.Date = RailHeadDate;
RailHead.Title = RailHeadTitle;
RailHead.Icon = RailHeadIcon;
RailHead.Count = RailHeadCount;
RailHead.Skeleton = RailHeadSkeleton;
RailHead.Pinned = RailHeadPinned;
