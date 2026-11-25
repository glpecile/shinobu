import { useReducer, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import Ionicons from '@react-native-vector-icons/ionicons/static';
import {
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';

import { ActionableRow } from '@/components/actionable-row';
import { AnimatedView } from '@/components/animated-view';
import { Button } from '@/components/button';
import { EmptyStateTile } from '@/components/empty-state-tile';
import { List, type LegendListRef } from '@/components/List';
import { RAIL_LINE, RAIL_W, RailHead } from '@/components/rail-head';
import {
  SCROLL_TO_TOP_THRESHOLD,
  ScrollToTopFab,
} from '@/components/scroll-to-top-fab';
import { RefreshControl } from '@/components/refresh-control';
import { SectionEnter } from '@/components/section-enter';
import { SmallPoster } from '@/components/small-poster';
import { ProviderIcon } from '@/components/provider-icon';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { Spinner } from '@/components/spinner';
import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';
import { useListDisclosure } from '@/lib/use-list-disclosure';
import { useWakeAt } from '@/lib/time/use-wake-at';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import {
  setDiaryDayCollapsed,
  useCollapsedDiaryDays,
} from '@/state/prefs/collapsed-diary-days';
import { useHiddenItems, type HiddenItem } from '@/state/prefs/hidden-items';
import { useReadingInPages } from '@/state/prefs/reading-unit';
import { useMediaDetailsQuery } from '@/state/queries/media-details';
import { useTraktMediaImages } from '@/state/queries/trakt';
import type { DiaryDay, MergedDiaryEntry, NormalizedMediaItem } from '@/types/media';

import { DiaryMonth, DiaryMonthSkeleton, formatDayDate } from './diary-activity';
import {
  clusterDayEntries,
  dayKeyForInstant,
  formatClusterCount,
  formatDayParts,
  formatEpisodeDetail,
  formatLogTime,
  shortClusterCount,
  summarizeCluster,
  matchesDiaryFormat,
  summarizeDay,
  type DaySummary,
  type DiaryFormat,
  type DiaryCluster,
  type DiaryDayParts,
} from './merge';

function DiaryStickyDate({
  activity,
  day,
  today,
  visible,
}: {
  activity: ReadonlyMap<string, DaySummary>;
  day: string | null;
  today: string;
  visible: boolean;
}) {
  const summary = day == null ? undefined : activity.get(day);
  if (day == null || summary == null) return null;
  return <RailHead.Pinned count={summary.label} title={formatDayDate(day, today)} visible={visible} />;
}

const ROW_BODY = 'flex-1 py-1.5 pr-6';
const POSTER = 'w-9 h-13.5 rounded';

type DiaryListItem =
  | { kind: 'month'; key: string; month: string }
  | {
      kind: 'header';
      key: string;
      dayKey: string;
      parts: DiaryDayParts;
      summary: string;
      collapsed: boolean;
    }
  | { kind: 'entry'; key: string; dayKey: string; entry: MergedDiaryEntry }
  | {
      kind: 'cluster';
      key: string;
      dayKey: string;
      cluster: DiaryCluster;
      view: ClusterView;
      expanded: boolean;
    }
  | { kind: 'child'; key: string; dayKey: string; entry: MergedDiaryEntry; last: boolean };

interface ClusterView {
  liked: boolean;
  item: NormalizedMediaItem;
  providers: ProviderId[];
  detail: string;
  runCount: string;
  label: string;
}

function clusterView(cluster: DiaryCluster): ClusterView {
  const summary = summarizeCluster(cluster);
  const range = formatEpisodeDetail({
    type: summary.item.type,
    ...(summary.season != null ? { season: summary.season } : {}),
    episodes: summary.episodes,
  });
  const spelled = formatClusterCount(summary.item.type, summary.count);
  return {
    liked: cluster.entries.some((entry) => entry.liked === true),
    item: summary.item,
    providers: summary.providers,
    detail: range !== '' ? range : spelled,
    runCount: shortClusterCount(summary),
    label: `${summary.item.title}, ${spelled}`,
  };
}

function newDate(): Date {
  return new Date();
}

function flattenDays(
  days: DiaryDay[],
  today: string,
  expanded: ReadonlySet<string>,
  collapsedDays: ReadonlySet<string>,
  hidden: readonly HiddenItem[],
  format: DiaryFormat,
  inlineMonths: boolean,
): { items: DiaryListItem[]; activity: Map<string, DaySummary> } {
  const hiddenIds = new Set(hidden.map((item) => item.id));
  const keep = (entry: MergedDiaryEntry) =>
    !entry.sourceIds.some((id) => hiddenIds.has(id)) && matchesDiaryFormat(entry.item, format);
  const items: DiaryListItem[] = [];
  const activity = new Map<string, DaySummary>();
  let month = '';
  for (const day of days) {
    const entries = day.entries.filter(keep);
    if (entries.length === 0) continue;
    const collapsed = collapsedDays.has(day.key);
    const summary = summarizeDay(entries);
    activity.set(day.key, summary);
    if (inlineMonths && day.key.slice(0, 7) !== month) {
      month = day.key.slice(0, 7);
      items.push({ kind: 'month', key: `m-${month}`, month });
    }
    items.push({
      kind: 'header',
      key: `h-${day.key}`,
      dayKey: day.key,
      parts: formatDayParts(day.key, today),
      summary: summary.label,
      collapsed,
    });
    if (collapsed) continue;
    for (const cluster of clusterDayEntries(entries)) {
      if (cluster.entries.length === 1) {
        const entry = cluster.entries[0];
        items.push({ kind: 'entry', key: entry.id, dayKey: day.key, entry });
        continue;
      }
      const isOpen = expanded.has(cluster.key);
      items.push({
        kind: 'cluster',
        key: `c-${cluster.key}`,
        dayKey: day.key,
        cluster,
        view: clusterView(cluster),
        expanded: isOpen,
      });
      if (isOpen) {
        cluster.entries.forEach((entry, index) =>
          items.push({
            kind: 'child',
            key: entry.id,
            dayKey: day.key,
            entry,
            last: index === cluster.entries.length - 1,
          }),
        );
      }
    }
  }
  return { items, activity };
}

function RailLine({ stop = false }: { stop?: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <View className={cn(RAIL_W, 'relative')}>
      <AnimatedView
        className={cn('absolute w-px bg-border top-0', RAIL_LINE)}
        style={{
          height: '100%',
          transformOrigin: 'top',
          transform: [{ scaleY: stop ? 0.5 : 1 }],
          transitionProperty: 'transform',
          transitionDuration: reduceMotion ? 0 : DURATION.toggle,
          transitionTimingFunction: EASE_IN_OUT,
        }}
      />
    </View>
  );
}

function DiaryDayHead({
  parts,
  summary,
  collapsed,
  onToggle,
}: {
  parts: DiaryDayParts;
  summary: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <RailHead label={`${parts.label} ${parts.day}, ${summary}`} onToggle={onToggle} open={!collapsed}>
      <RailHead.Date day={parts.day} label={parts.label} today={parts.isToday} />
      <RailHead.Count>{summary}</RailHead.Count>
    </RailHead>
  );
}

function ProviderMarks({ providers }: { providers: ProviderId[] }) {
  const names = providers.map((id) => PROVIDERS[id].label).join(', ');
  return (
    <View
      accessibilityLabel={`Logged via ${names}`}
      className="flex-row items-center gap-1 flex-none"
    >
      {providers.map((id) => (
        <ProviderIcon id={id} key={id} size={12} />
      ))}
    </View>
  );
}

function DiaryPoster({ item }: { item: NormalizedMediaItem }) {
  const { coverImage: providerCover, loading } = useTraktMediaImages(item);
  const { data: details } = useMediaDetailsQuery(
    providerCover === '' && !loading && item.externalIds.tmdb != null ? item : undefined,
  );
  const coverImage = providerCover || details?.catalogue?.coverImage || '';
  return <SmallPoster uri={coverImage} recyclingKey={item.id} size="sm" />;
}

function PosterFan({ item }: { item: NormalizedMediaItem }) {
  return (
    <View className="w-11.5 h-13.5 flex-none">
      <View className="absolute left-2.5 top-0.75 w-9 h-12 rounded bg-surface border border-border/40" />
      <View className="absolute left-1.25 top-0.25 w-9 h-13 rounded bg-surface border border-border/50" />
      <View className="absolute left-0 top-0">
        <DiaryPoster item={item} />
      </View>
    </View>
  );
}

function RowTrailing({
  liked,
  providers,
  time,
  runCount,
}: {
  liked?: boolean;
  providers: ProviderId[];
  time?: string;
  runCount?: string;
}) {
  const accent = useThemeColor('--color-accent');
  return (
    <View className="flex-row items-center gap-2.5 pl-3">
      {liked && (
        <View accessible accessibilityLabel="Liked">
          <Ionicons name="heart" size={14} color={accent} />
        </View>
      )}
      {runCount != null ? (
        <Text className="text-foreground font-sans-semibold text-[10px] rounded-full border border-accent/40 bg-accent/15 px-1.5 py-px">
          {runCount}
        </Text>
      ) : (
        time != null &&
        time !== '' && (
          <Text className="text-muted/70 font-sans text-[11px]">{time}</Text>
        )
      )}
      <ProviderMarks providers={providers} />
    </View>
  );
}

function entryHref(entry: MergedDiaryEntry): string {
  const { item, season, episodes } = entry;
  const number = episodes[0];
  if (number == null || episodes.length !== 1) return routes.details(item.id, item.type);
  if (season != null) return routes.episode(item.id, season, number);
  if (item.type === 'ANIME' && !item.isFilm) return routes.animeEpisode(item.id, number);
  return routes.details(item.id, item.type);
}

function DiaryRow({
  entry,
  timeZone,
  last,
  inPages,
  onOpen,
  onActions,
}: {
  entry: MergedDiaryEntry;
  timeZone: string;
  last: boolean;
  inPages: boolean;
  onOpen: (href: string) => void;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  const detail = formatEpisodeDetail({ ...entry, type: entry.item.type, inPages });
  const href = entryHref(entry);

  return (
    <View className="flex-row">
      <RailLine key={entry.id} stop={last} />
      <ActionableRow
        className={ROW_BODY}
        href={href}
        item={entry.item}
        leading={
          <>
            <DiaryPoster item={entry.item} />
            <View className="shrink ml-3">
              <Text
                className="text-foreground font-sans-semibold text-[15px]"
                numberOfLines={1}
              >
                {entry.item.title}
              </Text>
              {detail !== '' && (
                <Text className="text-muted font-sans text-xs mt-0.5">{detail}</Text>
              )}
            </View>
          </>
        }
        onActions={onActions}
        onPress={() => onOpen(href)}
        trailing={
          <RowTrailing
            liked={entry.liked}
            providers={entry.providers}
            time={formatLogTime(entry, timeZone)}
          />
        }
      />
    </View>
  );
}

function DiaryClusterRow({
  view,
  clusterKey,
  expanded,
  last,
  onToggle,
  onActions,
}: {
  view: ClusterView;
  clusterKey: string;
  expanded: boolean;
  last: boolean;
  onToggle: (key: string) => void;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  return (
    <View className="flex-row">
      <RailLine key={clusterKey} stop={last && !expanded} />
      <ActionableRow
        accessibility={{
          accessibilityHint: expanded ? 'Collapses this run' : 'Expands this run',
          accessibilityLabel: view.label,
          accessibilityRole: 'button',
          accessibilityState: { expanded },
        }}
        className={ROW_BODY}
        href={routes.details(view.item.id, view.item.type)}
        item={view.item}
        leading={
          <>
            <PosterFan item={view.item} />
            <View className="shrink ml-3">
              <Text
                className="text-foreground font-sans-semibold text-[15px]"
                numberOfLines={1}
              >
                {view.item.title}
              </Text>
              <Text className="text-muted font-sans text-xs mt-0.5">
                {view.detail}
              </Text>
            </View>
          </>
        }
        onActions={onActions}
        onPress={() => onToggle(clusterKey)}
        pressBehavior="immediate"
        trailing={
          <RowTrailing liked={view.liked} providers={view.providers} runCount={view.runCount} />
        }
      />
    </View>
  );
}

function DiaryChildRow({
  entry,
  timeZone,
  last,
  inPages,
  onOpen,
  onActions,
}: {
  entry: MergedDiaryEntry;
  timeZone: string;
  last: boolean;
  inPages: boolean;
  onOpen: (href: string) => void;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  const detail = formatEpisodeDetail({ ...entry, type: entry.item.type, inPages });
  const href = entryHref(entry);

  return (
    <View className="flex-row">
      <RailLine key={entry.id} stop={last} />
      <ActionableRow
        className="flex-1 h-9 pr-6 pl-3"
        href={href}
        item={entry.item}
        leading={
          <Text className="shrink text-muted font-sans text-[13px]" numberOfLines={1}>
            {detail !== '' ? detail : entry.item.title}
          </Text>
        }
        onActions={onActions}
        onPress={() => onOpen(href)}
        trailing={
          <RowTrailing
            liked={entry.liked}
            providers={entry.providers}
            time={formatLogTime(entry, timeZone)}
          />
        }
      />
    </View>
  );
}

function DiaryFailureBanner({
  providers,
  onRetry,
  className,
}: {
  providers: ProviderId[];
  onRetry: () => void;
  className?: string;
}) {
  const names = providers.map((id) => PROVIDERS[id].label).join(', ');
  // Centred by a wrapper, not `self-center`: on web Legend List puts the
  // header in a non-flex div, where align-self does nothing.
  return (
    <View className={cn('items-center mt-3 mb-4', className)}>
      <Button
        accessibilityLabel={`Retry loading ${names}`}
        icon={<Button.Icon name="refresh" />}
        label={`Couldn\u2019t load ${names}`}
        onPress={onRetry}
        size="sm"
        variant="quiet"
      />
    </View>
  );
}

function DiaryFooter({ loading }: { loading: boolean }) {
  return (
    <View accessibilityLabel={loading ? 'Loading more entries' : undefined} className="h-24 items-center justify-center">
      {loading && <Spinner />}
    </View>
  );
}

const SKELETON_TITLE_WIDTHS = ['w-2/3', 'w-1/2', 'w-3/5', 'w-5/12'];

function SkeletonRow({ index, last }: { index: number; last: boolean }) {
  const delay = staggerDelay(index);
  return (
    <View className="flex-row">
      <RailLine stop={last} />
      <View className={cn(ROW_BODY, 'flex-row items-center')}>
        <Skeleton className={POSTER} delay={delay} />
        <View className="flex-1 ml-3">
          <Skeleton
            className={cn(
              'h-3.5 rounded',
              SKELETON_TITLE_WIDTHS[index % SKELETON_TITLE_WIDTHS.length],
            )}
            delay={delay}
          />
          <Skeleton className="h-2.5 w-14 rounded mt-1.5" delay={delay} />
        </View>
        <Skeleton className="h-2 w-8 rounded ml-3" delay={delay} />
      </View>
    </View>
  );
}

const SKELETON_DAYS = [3, 4, 3];

const SIDE_CALENDAR_MIN_WIDTH = 1024;
const SIDE_CALENDAR = 'w-104 border-l border-border';

export function DiaryListSkeleton() {
  const wide = useWindowDimensions().width >= SIDE_CALENDAR_MIN_WIDTH;
  return (
    <View className="flex-1 flex-row">
      <View className="flex-1">
        {SKELETON_DAYS.map((rows, day) => (
          <View key={day}>
            {day === 0 && !wide && <DiaryMonthSkeleton />}
            <RailHead.Skeleton lead="date" />
            {Array.from({ length: rows }).map((_, row) => (
              <SkeletonRow index={day + row} key={row} last={row === rows - 1} />
            ))}
          </View>
        ))}
      </View>
      {wide && (
        <View className={SIDE_CALENDAR}>
          <DiaryMonthSkeleton stacked />
        </View>
      )}
    </View>
  );
}

export interface DiaryListProps {
  days: DiaryDay[];
  format: DiaryFormat;
  reading?: { chapters: boolean; books: boolean };
  timeZone: string;
  failedProviders: ProviderId[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onEndReached: () => void;
  onRetry: () => void;
  onRefresh: () => Promise<unknown>;
  onOpen: (href: string) => void;
  onItemActions: (item: NormalizedMediaItem) => void;
}

export function DiaryList({
  days,
  format,
  reading,
  timeZone,
  failedProviders,
  hasNextPage,
  isFetchingNextPage,
  onEndReached,
  onRetry,
  onRefresh,
  onOpen,
  onItemActions,
}: DiaryListProps) {
  const reduceMotion = useReducedMotion();
  const listRef = useRef<LegendListRef>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const { expanded, toggle: toggleCluster } = useListDisclosure();
  const collapsedDays = useCollapsedDiaryDays();
  const inPages = useReadingInPages();
  const hiddenItems = useHiddenItems();
  const muted = useThemeColor('--color-muted');
  const wide = useWindowDimensions().width >= SIDE_CALENDAR_MIN_WIDTH;
  let emptyIcon: React.ComponentProps<typeof Ionicons>['name'];
  let emptyTitle: string;
  switch (format) {
    case 'ALL':
      emptyIcon = 'book-outline';
      emptyTitle = 'No visible logs';
      break;
    case 'MOVIE':
      emptyIcon = 'film-outline';
      emptyTitle = hasNextPage ? 'No movies in loaded history' : 'No movies logged yet';
      break;
    case 'TV':
      emptyIcon = 'tv-outline';
      emptyTitle = hasNextPage ? 'No TV shows in loaded history' : 'No TV shows logged yet';
      break;
    case 'READING':
      emptyIcon = 'book-outline';
      emptyTitle = hasNextPage ? 'No reading in loaded history' : 'No reading logged yet';
      break;
  }
  const [sticky, setSticky] = useState<{ day: string | null; visible: boolean }>({
    day: null,
    visible: false,
  });
  const [visibleMonth, setVisibleMonth] = useState<string | null>(null);
  // State, not an ambient `new Date()`, which React Compiler would cache until
  // `timeZone` changes. It rolls over at local midnight and on foreground.
  const [now, refreshNow] = useReducer(newDate, undefined, newDate);
  useWakeAt(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime(), now, refreshNow);

  // No hook below this point, and only plain values into `flattenDays`: React
  // Compiler drops the memo when an input was made before a hook call or is a
  // closure, and then the rows and both calendars rebuild on every
  // sticky-header change while scrolling.
  const today = dayKeyForInstant(now, timeZone);
  const { items, activity } = flattenDays(
    days,
    today,
    expanded,
    collapsedDays,
    hiddenItems,
    format,
    !wide,
  );

  const activityProps = {
    activity,
    oldest: hasNextPage ? (days.at(-1)?.key ?? '') : '',
    today,
    loadingMore: isFetchingNextPage,
    onLoadMore: onEndReached,
    reading: format === 'READING' ? reading : undefined,
    onSelectDay: (dayKey: string) => {
      const index = items.findIndex((item) => item.kind === 'header' && item.dayKey === dayKey);
      if (index !== -1) void listRef.current?.scrollToIndex({ index, animated: !reduceMotion });
    },
  };

  function isLastOfDay(index: number) {
    const next = items[index + 1];
    return next == null || next.kind === 'header' || next.kind === 'month';
  }

  function handleViewableItemsChanged({
    viewableItems,
  }: {
    viewableItems: Array<{ index: number; item: DiaryListItem }>;
  }) {
    let top = viewableItems[0];
    for (const token of viewableItems) if (token.index < top.index) top = token;
    const item = top?.item;
    if (item != null) setVisibleMonth(item.kind === 'month' ? item.month : item.dayKey.slice(0, 7));
    const day = item == null || item.kind === 'month' || item.kind === 'header' ? null : item.dayKey;
    setSticky((previous) => {
      if (day == null) return previous.visible ? { ...previous, visible: false } : previous;
      return previous.visible && previous.day === day ? previous : { day, visible: true };
    });
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const past = event.nativeEvent.contentOffset.y > SCROLL_TO_TOP_THRESHOLD;
    if (past !== showScrollTop) setShowScrollTop(past);
  }

  const sideMonth = visibleMonth ?? (days[0]?.key ?? today).slice(0, 7);

  return (
    <View className="flex-1 flex-row">
      <View className="flex-1">
        <List
          ref={listRef}
          onScroll={handleScroll}
          data={items}
          extraData={inPages}
          keyExtractor={(item) => item.key}
          renderItem={({ item, index }) => {
            switch (item.kind) {
              case 'month':
                // Keyed so a recycled slot remounts instead of animating from the previous month's state.
                return <DiaryMonth className={cn(index > 0 && 'pt-6')} key={item.month} month={item.month} {...activityProps} />;
              case 'header':
                return (
                  <DiaryDayHead
                    collapsed={item.collapsed}
                    summary={item.summary}
                    onToggle={() => setDiaryDayCollapsed(item.dayKey, !collapsedDays.has(item.dayKey))}
                    parts={item.parts}
                  />
                );
              case 'cluster':
                return (
                  <DiaryClusterRow
                    clusterKey={item.cluster.key}
                    expanded={item.expanded}
                    last={isLastOfDay(index)}
                    onActions={onItemActions}
                    onToggle={toggleCluster}
                    view={item.view}
                  />
                );
              case 'child':
                return (
                  <DiaryChildRow
                    entry={item.entry}
                    inPages={inPages}
                    last={isLastOfDay(index)}
                    onActions={onItemActions}
                    onOpen={onOpen}
                    timeZone={timeZone}
                  />
                );
              default:
                return (
                  <DiaryRow
                    entry={item.entry}
                    inPages={inPages}
                    last={isLastOfDay(index)}
                    onActions={onItemActions}
                    onOpen={onOpen}
                    timeZone={timeZone}
                  />
                );
            }
          }}
          ListHeaderComponent={
            failedProviders.length > 0 && !wide ? (
              <DiaryFailureBanner onRetry={onRetry} providers={failedProviders} />
            ) : undefined
          }
          ListEmptyComponent={
            <SectionEnter className="py-8" key={format}>
              <EmptyStateTile
                icon={<Ionicons accessible={false} color={muted} name={emptyIcon} size={44} />}
                title={emptyTitle}
              >
                {hasNextPage && (
                  <Button
                    className="mt-6"
                    icon={<Button.Icon name="chevron-down" />}
                    label="Load more"
                    loading={isFetchingNextPage}
                    onPress={onEndReached}
                    variant="quiet"
                  />
                )}
              </EmptyStateTile>
            </SectionEnter>
          }
          ListFooterComponent={
            <DiaryFooter loading={hasNextPage && isFetchingNextPage} />
          }
          estimatedItemSize={36}
          getItemType={(item) => item.kind}
          onEndReached={hasNextPage ? onEndReached : undefined}
          onEndReachedThreshold={0.6}
          onViewableItemsChanged={handleViewableItemsChanged}
          recycleItems
          refreshControl={
            <RefreshControl onRefresh={onRefresh} tab="diary" />
          }
        />
        <DiaryStickyDate activity={activity} day={sticky.day} today={today} visible={sticky.visible} />
        <ScrollToTopFab
          className="ios:bottom-24"
          onPress={() => void listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion })}
          visible={showScrollTop}
        />
      </View>
      {wide && (
        <View className={SIDE_CALENDAR}>
          {failedProviders.length > 0 && (
            <DiaryFailureBanner className="items-start px-6" onRetry={onRetry} providers={failedProviders} />
          )}
          <SectionEnter key={sideMonth}>
            <DiaryMonth month={sideMonth} stacked {...activityProps} />
          </SectionEnter>
        </View>
      )}
    </View>
  );
}
