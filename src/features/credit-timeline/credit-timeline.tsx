import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ActionableRow } from '@/components/actionable-row';
import { AnimatedText, AnimatedView } from '@/components/animated-view';
import { Image } from '@/components/image';
import { List } from '@/components/List';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableOpacity } from '@/components/presstable';
import { SegmentedControl } from '@/components/segmented-control';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { mediaKindLabel } from '@/features/watchlist/watchlist-rows';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { usePageEnterStyle } from '@/lib/page-transition';
import { routes } from '@/lib/routes';
import { useThemeColor } from '@/lib/theme-color';
import type { NormalizedMediaItem } from '@/types/media';

import {
  roleCounts,
  timelineRows,
  type Credit,
  type Filmography,
  type FormatFilter,
} from './group';

/**
 * The diary's rail, verbatim: a fixed gutter every row shares with one
 * hairline down it, the year sitting *in* the gutter at the top of its run the
 * way the diary's date does. Two surfaces that list titles down a rail should
 * not have two rails.
 */
const RAIL_W = 'w-14';
const RAIL_LINE = 'left-7';
/** Row height is the poster plus padding: 54 + 6 + 6 = 66px. */
const ROW_BODY = 'flex-1 py-1.5 pr-6';
const POSTER = 'w-9 h-[54px] rounded';
const ROW_HEIGHT = 66;
/** A `text-xl leading-none` numeral under `pt-5` ends at 40px; the rail resumes there. */
const HEAD_LINE_TOP = 'top-10';

/** "All" first, as on the seasons explorer — it is the shape the page opens in. */
const FORMAT_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'MOVIE', label: 'Movies' },
  { value: 'TV', label: 'TV', accessibilityLabel: 'TV series' },
] as const satisfies readonly { value: FormatFilter; label: string; accessibilityLabel?: string }[];

const CHIP_TRANSITION = {
  transitionProperty: 'color',
  transitionDuration: DURATION.color,
  transitionTimingFunction: EASE_OUT,
} as const;

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
 * A role filter chip. Inverted when selected (foreground fill), never the
 * accent — it changes what you are looking at, not what you are about to do,
 * the same reasoning as the segmented control beside it. The fill crossfades
 * on a stacked layer and the label's colour transitions with it, so a tap
 * reads as one state settling rather than two classNames hard-swapping.
 */
function RoleChip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
}) {
  const foreground = useThemeColor('--color-foreground');
  const background = useThemeColor('--color-background');
  const muted = useThemeColor('--color-muted');
  return (
    <PresstableOpacity
      accessibilityLabel={count == null ? label : `${label}, ${count}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
    >
      <View className="flex-row items-baseline gap-1.5 rounded-full px-3 py-1.5">
        <View className="absolute inset-0 rounded-full border border-border" />
        <AnimatedView
          className="absolute inset-0 rounded-full bg-foreground"
          style={{
            opacity: selected ? 1 : 0,
            transitionProperty: 'opacity',
            transitionDuration: DURATION.color,
            transitionTimingFunction: EASE_OUT,
          }}
        />
        <AnimatedText
          className="font-sans-semibold text-sm"
          style={{ color: selected ? background : foreground, ...CHIP_TRANSITION }}
        >
          {label}
        </AnimatedText>
        {count != null && (
          <AnimatedText
            className="font-sans text-xs"
            style={{ color: selected ? background : muted, ...CHIP_TRANSITION }}
          >
            {count}
          </AnimatedText>
        )}
      </View>
    </PresstableOpacity>
  );
}

/**
 * A run's head: the year in the gutter, its title count and a hairline
 * reaching right. The upcoming head is the one with a control — the whole row
 * toggles the fold, with Show/Hide where the diary's chevron sits — and it is
 * muted throughout: unreleased work is a footnote to a filmography, not its
 * headline.
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
  const body = (
    <>
      <View className={cn(RAIL_W, 'items-center relative')}>
        <Text
          className={cn(
            'font-display text-xl leading-none',
            upcoming ? 'text-muted' : 'text-foreground',
          )}
        >
          {upcoming ? 'TBA' : year}
        </Text>
        {open && (
          <View className={cn('absolute w-px bg-border bottom-0', HEAD_LINE_TOP, RAIL_LINE)} />
        )}
      </View>
      <View className="flex-1 flex-row items-center pr-6 pb-4">
        <Text className="text-muted/70 font-sans text-[11px] mr-3">
          {count} {upcoming ? 'upcoming' : count === 1 ? 'title' : 'titles'}
        </Text>
        <View className="flex-1 h-px bg-border" />
        {upcoming && (
          <Text className="text-muted font-sans-semibold text-xs ml-3">
            {open ? 'Hide' : 'Show'}
          </Text>
        )}
      </View>
    </>
  );

  if (!upcoming) return <View className="flex-row pt-5">{body}</View>;
  return (
    <PresstableOpacity
      accessibilityHint={open ? 'Hides upcoming titles' : 'Shows upcoming titles'}
      accessibilityLabel={`${count} upcoming`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      className="flex-row pt-5"
      onPress={onToggle}
    >
      {body}
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
 * it lives in neither the URL nor a device pref. Filtering changes the rows in
 * place with no entrance of its own: chips are tapped many times a visit, and
 * the pill's slide and the chip's fill are already the answer to the tap.
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
  const [format, setFormat] = useState<FormatFilter>('ALL');
  const [role, setRole] = useState<string | null>(null);
  const [showUpcoming, setShowUpcoming] = useState(false);

  const counts = roleCounts(filmography, format);
  // A role the new format emptied falls back to every role, rather than
  // showing nothing under a chip that is no longer there.
  const activeRole = counts.some((entry) => entry.role === role) ? role : null;
  const rows = timelineRows(filmography.credits, { format, role: activeRole, showUpcoming });

  return (
    <View className="flex-1" style={enter}>
      <List
        data={rows}
        estimatedItemSize={ROW_HEIGHT}
        getItemType={(row) => row.kind}
        keyExtractor={(row) => row.key}
        ListEmptyComponent={
          <Column>
            <Text className="text-muted font-sans text-sm px-6 py-8">
              Nothing here for this filter.
            </Text>
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
            <View className="px-6 pt-6 pb-3">
              <SegmentedControl
                accessibilityLabel="Format"
                className="w-52"
                onChange={setFormat}
                options={FORMAT_OPTIONS}
                size="sm"
                value={format}
              />
            </View>
            {/* One role needs no chip to pick it. A strip, not a wrap: a
                crew veteran has eight departments, and a wrapped row of them
                pushes the filmography a screen down on a phone. */}
            {counts.length > 1 && (
              <ScrollView
                contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                <RoleChip
                  label="All roles"
                  onPress={() => setRole(null)}
                  selected={activeRole == null}
                />
                {counts.map((entry) => (
                  <RoleChip
                    count={entry.count}
                    key={entry.role}
                    label={entry.role}
                    onPress={() => setRole(entry.role)}
                    selected={activeRole === entry.role}
                  />
                ))}
              </ScrollView>
            )}
          </Column>
        }
        // Rows derive entirely from props (the diary's reason, and its same
        // stale-hover residual on web).
        recycleItems
        renderItem={({ item: row }) => (
          <Column>
            {row.kind === 'head' ? (
              <TimelineHead
                count={row.count}
                onToggle={() => setShowUpcoming(!showUpcoming)}
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
          </Column>
        )}
      />
    </View>
  );
}

const SKELETON_TITLE_WIDTHS = ['w-2/3', 'w-1/2', 'w-3/5', 'w-5/12'];
/** Run sizes that read as a plausible filmography rather than a uniform block. */
const SKELETON_RUNS = [2, 1, 3];

function SkeletonHead() {
  return (
    <View className="flex-row pt-5">
      <View className={cn(RAIL_W, 'items-center relative')}>
        {/* 20px tall: `font-display text-xl leading-none`. */}
        <Skeleton className="w-10 h-5 rounded" />
        <View className={cn('absolute w-px bg-border bottom-0', HEAD_LINE_TOP, RAIL_LINE)} />
      </View>
      <View className="flex-1 flex-row items-center pr-6 pb-4">
        <Skeleton className="h-2.5 w-12 rounded mr-3" />
        <View className="flex-1 h-px bg-border" />
      </View>
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
            className={cn('h-3.5 rounded', SKELETON_TITLE_WIDTHS[index % SKELETON_TITLE_WIDTHS.length])}
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
      <View className="px-6 pt-6 pb-3">
        <Skeleton className="h-7 w-52 rounded-full" />
      </View>
      <View className="flex-row gap-2 px-6 overflow-hidden">
        {['w-20', 'w-24', 'w-20', 'w-24'].map((width, index) => (
          <Skeleton className={cn('h-8 rounded-full', width)} delay={staggerDelay(index)} key={index} />
        ))}
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
