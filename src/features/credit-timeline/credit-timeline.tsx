import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRef, useState, type ReactNode } from 'react';
import {
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ActionableRow } from '@/components/actionable-row';
import { AnimatedView } from '@/components/animated-view';
import { Button } from '@/components/button';
import { EmptyStateTile } from '@/components/empty-state-tile';
import { Image } from '@/components/image';
import { List, type LegendListRef } from '@/components/List';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableOpacity } from '@/components/presstable';
import { SCROLL_TO_TOP_THRESHOLD, ScrollToTopFab } from '@/components/scroll-to-top-fab';
import { SegmentedControl } from '@/components/segmented-control';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { mediaKindLabel } from '@/features/watchlist/watchlist-rows';
import { cn } from '@/lib/cn';
import { DURATION, KEYFRAME_EASE_OUT } from '@/lib/motion';
import { usePageEnterStyle } from '@/lib/page-transition';
import { routes } from '@/lib/routes';
import { useThemeColor } from '@/lib/theme-color';
import type { NormalizedMediaItem } from '@/types/media';

import {
  roleCounts,
  timelineRows,
  UPCOMING_HEAD,
  type Credit,
  type Filmography,
  type FormatFilter,
} from './group';
import { RoleSheet } from './role-sheet';

/**
 * The diary's rail, verbatim: a fixed gutter every row shares with one
 * hairline down it. Two surfaces that list titles down a rail should not
 * have two rails. Heads sit on the page gutter (`px-6`) with the hero and
 * the controls, so every left edge above a poster is the same edge.
 */
const RAIL_W = 'w-14';
const RAIL_LINE = 'left-7';
/** Row height is the poster plus padding: 54 + 6 + 6 = 66px. */
const ROW_BODY = 'flex-1 py-1.5 pr-6';
const POSTER = 'w-9 h-[54px] rounded';
const ROW_HEIGHT = 66;
/** The head row is `pt-5` + a 20px `text-xl leading-none` year + `pb-4`. */
const HEAD = 'flex-row items-center px-6 pt-5 pb-4 relative';
/** The rail resumes under the year, from 40px down. */
const HEAD_LINE = cn('absolute w-px bg-border top-10 bottom-0', RAIL_LINE);

/** The role button sits under the pill on a phone and beside it from `md`. */
const ROLE_BUTTON = 'self-start mt-3 md:mt-0 md:ml-3';

/**
 * How far the rows dip when a filter changes them. Not to zero: the list is
 * refocusing, not arriving, and a dip from nothing reads as a reload.
 */
const SETTLE_FROM = 0.35;
/** Blur is web-only: native re-rasterizes a filtered subtree every frame. */
const SETTLE_BLUR = process.env.EXPO_OS === 'web' ? 4 : 0;

/** "All" first, as on the seasons explorer — it is the shape the page opens in. */
const FORMAT_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'MOVIE', label: 'Movies' },
  { value: 'TV', label: 'TV', accessibilityLabel: 'TV series' },
] as const satisfies readonly {
  value: FormatFilter;
  label: string;
  accessibilityLabel?: string;
}[];

/**
 * Wide screens read the page as one centred column. Centred from the outer
 * wrapper rather than with `self-center`: Legend List's header slot does not
 * stretch its child on web, so a self-centred column sat flush left there
 * while the rows below it were centred.
 */
function Column({ children }: { children: ReactNode }) {
  return (
    <View className="w-full items-center">
      <View className="w-full max-w-4xl">{children}</View>
    </View>
  );
}

/**
 * A run's head: the year, its title count, a hairline reaching right and
 * Show/Hide where the diary's chevron sits; the whole row toggles the fold.
 * The upcoming head is muted throughout: unreleased work is a footnote to a
 * filmography, not its headline.
 */
function TimelineHead({
  year,
  count,
  open,
  onToggle,
}: {
  year: number | null;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const upcoming = year == null;
  const label = `${count} ${upcoming ? 'upcoming' : count === 1 ? 'title' : 'titles'}`;
  return (
    <PresstableOpacity
      accessibilityHint={open ? 'Hides these titles' : 'Shows these titles'}
      accessibilityLabel={`${upcoming ? 'Upcoming' : year}, ${label}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      className={HEAD}
      onPress={onToggle}
    >
      <Text
        className={cn(
          'font-display text-xl leading-none',
          upcoming ? 'text-muted' : 'text-foreground',
        )}
      >
        {upcoming ? 'TBA' : year}
      </Text>
      <Text className="text-muted/70 font-sans text-[11px] ml-2 mr-3">{label}</Text>
      <View className="flex-1 h-px bg-border" />
      {/* Fixed width: "Show" and "Hide" differ by a few px, and the hairline
          should end at one place down the whole page. */}
      <Text className="text-muted font-sans-semibold text-xs ml-3 w-10 text-right">
        {open ? 'Hide' : 'Show'}
      </Text>
      {open && <View className={HEAD_LINE} />}
    </PresstableOpacity>
  );
}

/** The hairline an entry row contributes; `stop` ends it halfway on a run's last row. */
function RailLine({ stop }: { stop: boolean }) {
  return (
    <View className={cn(RAIL_W, 'relative')}>
      <View
        className={cn('absolute w-px bg-border top-0', RAIL_LINE, stop ? 'h-1/2' : 'bottom-0')}
      />
    </View>
  );
}

function TimelineEntry({
  credit,
  roles,
  last,
  onPress,
  onActions,
}: {
  credit: Credit;
  roles: string;
  last: boolean;
  onPress: (item: NormalizedMediaItem) => void;
  onActions: (credit: Credit, roles: string) => void;
}) {
  const { item } = credit;
  const detail = [mediaKindLabel(item), roles].filter((part) => part !== '').join(' · ');
  return (
    <View className="flex-row">
      <RailLine stop={last} />
      <ActionableRow
        className={ROW_BODY}
        href={routes.details(item.id)}
        item={item}
        leading={
          <>
            {item.coverImage === '' ? (
              <PosterPlaceholder className={POSTER} />
            ) : (
              <Image
                source={{ uri: item.coverImage }}
                className={cn(POSTER, 'bg-surface border border-border/50')}
                contentFit="cover"
                recyclingKey={item.id}
              />
            )}
            <View className="shrink ml-3">
              <Text className="text-foreground font-sans-semibold text-[15px]" numberOfLines={1}>
                {item.title}
              </Text>
              <Text className="text-muted font-sans text-xs mt-0.5" numberOfLines={1}>
                {detail}
              </Text>
            </View>
          </>
        }
        onActions={() => onActions(credit, roles)}
        onPress={() => onPress(item)}
      />
    </View>
  );
}

export interface CreditTimelineProps {
  filmography: Filmography;
  /** The page's hero (name, portrait, biography) — scrolls with the list. */
  header: ReactNode;
  footer?: ReactNode;
  onItemPress: (item: NormalizedMediaItem) => void;
  /** Long-press, or the web hover ⋯ — with the credit's role text for the sheet. */
  onItemActions: (credit: Credit, roles: string) => void;
}

/**
 * A filmography down one rail, newest first, with a head per release year.
 * The controls above it narrow by format and by role — both
 * local state: a filter is a way of reading this page, not a destination, so
 * it lives in neither the URL nor a device pref. A filter change swaps the
 * rows in place and lets them settle: one shared value dips every row to a
 * soft blur and brings it back over `DURATION.swap`, so the new list reads
 * as the old one refocusing rather than two lists cutting. No per-row
 * entrance — the rows are recycled, and an `entering` on a cell replays on
 * every scroll.
 *
 * The whole page is the list, hero included, so a long filmography (a
 * character actor's three hundred credits) mounts a screen of rows rather than
 * three hundred posters; the web enter (blur-fade) plays once, on the frame
 * the query resolves.
 */
export function CreditTimeline({
  filmography,
  header,
  footer,
  onItemPress,
  onItemActions,
}: CreditTimelineProps) {
  const enter = usePageEnterStyle();
  const muted = useThemeColor('--color-muted');
  const reduceMotion = useReducedMotion();
  const settle = useSharedValue(1);
  const settleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(settle.value, [0, 1], [SETTLE_FROM, 1]),
    ...(SETTLE_BLUR > 0 && !reduceMotion
      ? // A CSS string, which is what react-native-web paints; RN's typed
        // filter array is the native shape this never takes.
        {
          filter:
            `blur(${((1 - settle.value) * SETTLE_BLUR).toFixed(1)}px)` as unknown as ViewStyle['filter'],
        }
      : {}),
  }));
  function refocus() {
    settle.value = 0;
    settle.value = withTiming(1, {
      duration: DURATION.swap,
      easing: KEYFRAME_EASE_OUT,
    });
  }
  const listRef = useRef<LegendListRef>(null);
  // Flipped on threshold crossings only, so scrolling doesn't re-render (the diary's rule).
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [format, setFormat] = useState<FormatFilter>('ALL');
  const [role, setRole] = useState<string | null>(null);
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);
  // Only unreleased work starts folded.
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set([UPCOMING_HEAD]));
  const toggleFold = (key: string) => {
    const next = new Set(folded);
    if (!next.delete(key)) next.add(key);
    setFolded(next);
  };

  const counts = roleCounts(filmography, format);
  // A role the new format emptied falls back to every role, rather than
  // showing nothing under a chip that is no longer there.
  const activeRole = counts.some((entry) => entry.role === role) ? role : null;
  const rows = timelineRows(filmography.credits, {
    format,
    role: activeRole,
    folded,
  });

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const past = event.nativeEvent.contentOffset.y > SCROLL_TO_TOP_THRESHOLD;
    if (past !== showScrollTop) setShowScrollTop(past);
  }

  return (
    <View className="flex-1" style={enter}>
      <List
        ref={listRef}
        onScroll={handleScroll}
        data={rows}
        estimatedItemSize={ROW_HEIGHT}
        getItemType={(row) => row.kind}
        keyExtractor={(row) => row.key}
        ListEmptyComponent={
          <Column>
            <EmptyStateTile
              className="py-10"
              description="Try another format or role."
              icon={<Ionicons color={muted} name="film-outline" size={28} />}
              title="Nothing for this filter"
            />
          </Column>
        }
        ListFooterComponent={
          <Column>
            {footer}
            <View className="h-12" />
          </Column>
        }
        ListHeaderComponent={
          <Column>
            {header}
            <View className="px-6 pt-2">
              {/* The section head the details page gives its sections: it
                  names what the two control rows filter, and marks where
                  the hero ends and the list begins. */}
              <View className="flex-row items-baseline gap-2 mb-3">
                <Text className="font-display text-xl text-foreground">Filmography</Text>
                <Text className="text-muted font-sans text-xs">
                  {filmography.credits.length}{' '}
                  {filmography.credits.length === 1 ? 'title' : 'titles'}
                </Text>
              </View>
              <View className="md:flex-row md:items-center pb-3">
                <SegmentedControl
                  accessibilityLabel="Format"
                  className="w-52"
                  onChange={(next) => {
                    refocus();
                    setFormat(next);
                  }}
                  options={FORMAT_OPTIONS}
                  size="sm"
                  value={format}
                />
                {/* One role needs no picker. */}
                {counts.length > 1 && (
                  <Button
                    accessibilityLabel={`Role: ${activeRole ?? 'All roles'}`}
                    className={ROLE_BUTTON}
                    icon={<Button.Icon name="filter-outline" />}
                    label={activeRole ?? 'All roles'}
                    morphLabel
                    onPress={() => setRoleSheetOpen(true)}
                    shape="pill"
                    size="sm"
                    trailingIcon={<Button.Icon name="chevron-down" />}
                    variant="quiet"
                  />
                )}
              </View>
            </View>
          </Column>
        }
        // Rows derive entirely from props (the diary's reason, and its same
        // stale-hover residual on web).
        recycleItems
        renderItem={({ item: row }) => (
          <Column>
            <AnimatedView style={settleStyle}>
              {row.kind === 'head' ? (
                <TimelineHead
                  count={row.count}
                  onToggle={() => toggleFold(row.key)}
                  open={row.open}
                  year={row.year}
                />
              ) : (
                <TimelineEntry
                  credit={row.credit}
                  last={row.last}
                  onActions={onItemActions}
                  onPress={onItemPress}
                  roles={row.roles}
                />
              )}
            </AnimatedView>
          </Column>
        )}
      />
      <ScrollToTopFab
        onPress={() => void listRef.current?.scrollToOffset({ offset: 0 })}
        visible={showScrollTop}
      />
      <RoleSheet
        onClose={() => setRoleSheetOpen(false)}
        onSelect={(next) => {
          if (next === activeRole) return;
          refocus();
          setRole(next);
        }}
        open={roleSheetOpen}
        roles={counts}
        value={activeRole}
      />
    </View>
  );
}

const SKELETON_TITLE_WIDTHS = ['w-2/3', 'w-1/2', 'w-3/5', 'w-5/12'];
/** Run sizes that read as a plausible filmography rather than a uniform block. */
const SKELETON_RUNS = [2, 1, 3];

function SkeletonHead() {
  return (
    <View className={HEAD}>
      {/* 20px tall: `font-display text-xl leading-none`. */}
      <Skeleton className="w-10 h-5 rounded" />
      <Skeleton className="h-2.5 w-12 rounded ml-2 mr-3" />
      <View className="flex-1 h-px bg-border" />
      <View className={HEAD_LINE} />
    </View>
  );
}

function SkeletonRow({ index, last }: { index: number; last: boolean }) {
  return (
    <View className="flex-row">
      <RailLine stop={last} />
      <View className={cn(ROW_BODY, 'flex-row items-center')}>
        <Skeleton className={POSTER} delay={staggerDelay(index)} />
        <View className="flex-1 ml-3">
          <Skeleton
            className={cn(
              'h-3.5 rounded',
              SKELETON_TITLE_WIDTHS[index % SKELETON_TITLE_WIDTHS.length],
            )}
            delay={staggerDelay(index)}
          />
          <Skeleton className="h-2.5 w-20 rounded mt-1.5" delay={staggerDelay(index)} />
        </View>
      </View>
    </View>
  );
}

/**
 * The controls and the first runs of the rail, on the real rail's geometry —
 * the same constants size both, so the resolve replaces bars with text and
 * moves nothing.
 */
export function CreditTimelineSkeleton() {
  return (
    <View>
      <View className="px-6 pt-2">
        <Skeleton className="h-5 w-32 rounded mb-3" />
        <View className="md:flex-row md:items-center pb-3">
          <Skeleton className="h-7 w-52 rounded-full" />
          <Skeleton className={cn(ROLE_BUTTON, 'h-9 w-32 rounded-full')} delay={staggerDelay(1)} />
        </View>
      </View>
      {SKELETON_RUNS.map((rows, run) => (
        <View key={run}>
          <SkeletonHead />
          {Array.from({ length: rows }).map((_, row) => (
            <SkeletonRow index={run + row} key={row} last={row === rows - 1} />
          ))}
        </View>
      ))}
    </View>
  );
}
