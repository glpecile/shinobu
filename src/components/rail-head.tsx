import Ionicons from '@react-native-vector-icons/ionicons/static';
import { createContext, useContext, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import { Skeleton } from '@/components/skeleton';
import { cn } from '@/lib/cn';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';

/**
 * The rail every list down a gutter shares: a fixed-width left column with
 * one hairline at its centre. Row bodies (`RailLine`, posters) in the diary
 * and the filmography size themselves from these.
 */
export const RAIL_W = 'w-14';
/** Centre of `RAIL_W` (56px), where the hairline sits. */
export const RAIL_LINE = 'left-7';

const ROW = 'flex-row pt-5';
/** `pb-3` so the count and rule centre on the lead's headline, not the block. */
const TRAILING = 'flex-1 flex-row items-center pr-6 pb-3';
const RULE = 'flex-1 h-px bg-border';
const LEAD_LINE = cn('absolute w-px bg-border bottom-0', RAIL_LINE);

const OpenContext = createContext(true);

/**
 * The head of a run of rail rows — a diary day, a filmography year. One
 * pressable row that toggles the run, composed of a lead (the date stacked
 * in the gutter, or a title on the page edge) and the count that runs a
 * hairline out to the chevron. The lead owns the stub of rail under it, and
 * draws it only while the run is open, so a folded head ends clean.
 *
 * ```tsx
 * <RailHead label="Sep 14, 10 entries" onToggle={…} open={open}>
 *   <RailHead.Date day="14" label="Sep" />
 *   <RailHead.Count>10 entries</RailHead.Count>
 * </RailHead>
 * ```
 */
export function RailHead({
  open,
  onToggle,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** What the row announces; the hint says what a press does. */
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
    >
      <OpenContext.Provider value={open}>{children}</OpenContext.Provider>
    </PresstableOpacity>
  );
}

/** The date stacked in the gutter: numeral over month, the rail resuming below. */
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
    <View className={cn(RAIL_W, 'items-center relative')}>
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

/**
 * A title on the page gutter (`px-6`), the rail resuming under its first
 * letters. `pb-3` matches the trailing block, so the count centres on the title.
 */
function RailHeadTitle({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
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
      {open && <View className={cn(LEAD_LINE, 'top-5')} />}
    </View>
  );
}

/** The count, then the hairline out to the chevron that turns with the fold. */
function RailHeadCount({ children }: { children: ReactNode }) {
  const open = useContext(OpenContext);
  const muted = useThemeColor('--color-muted');
  const reduceMotion = useReducedMotion();
  return (
    <View className={TRAILING}>
      <Text className="text-muted/70 font-sans text-[11px] mr-3">{children}</Text>
      <View className={RULE} />
      <AnimatedView
        className="ml-2.5"
        style={{
          transform: [{ rotate: open ? '180deg' : '0deg' }],
          transitionProperty: 'transform',
          transitionDuration: reduceMotion ? 0 : DURATION.toggle,
          transitionTimingFunction: EASE_IN_OUT,
        }}
      >
        <Ionicons color={muted} name="chevron-down" size={14} />
      </AnimatedView>
    </View>
  );
}

/** The head's bars on the head's geometry, so the resolve moves nothing. */
function RailHeadSkeleton({ lead }: { lead: 'date' | 'title' }) {
  return (
    <View className={ROW}>
      {lead === 'date' ? (
        <View className={cn(RAIL_W, 'items-center relative')}>
          {/* 24px tall: `font-display text-2xl leading-none`. */}
          <Skeleton className="w-7 h-6 rounded" />
          <Skeleton className="w-6 h-3 rounded mt-1" />
          <View className={cn(LEAD_LINE, 'top-11')} />
        </View>
      ) : (
        <View className="relative pl-6 pr-2 pb-3">
          {/* 20px tall: `font-display text-xl leading-none`. */}
          <Skeleton className="w-10 h-5 rounded" />
          <View className={cn(LEAD_LINE, 'top-5')} />
        </View>
      )}
      <View className={TRAILING}>
        <Skeleton className="h-2.5 w-16 rounded mr-3" />
        <View className={RULE} />
      </View>
    </View>
  );
}

RailHead.Date = RailHeadDate;
RailHead.Title = RailHeadTitle;
RailHead.Count = RailHeadCount;
RailHead.Skeleton = RailHeadSkeleton;
