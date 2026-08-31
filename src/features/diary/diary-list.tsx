import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ActionableRow } from '@/components/actionable-row';
import { Image } from '@/components/image';
import { List, type LegendListRef } from '@/components/List';
import { PresstableOpacity } from '@/components/presstable';
import {
  SCROLL_TO_TOP_THRESHOLD,
  ScrollToTopFab,
} from '@/components/scroll-to-top-fab';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { Skeleton } from '@/components/skeleton';
import { PROVIDER_DOT } from '@/features/trackers/provider-style';
import { cn } from '@/lib/cn';
import { useTabDoubleTap } from '@/lib/navigation/tab-double-tap';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import {
  setDiaryDayCollapsed,
  useCollapsedDiaryDays,
} from '@/state/prefs/collapsed-diary-days';
import { useHiddenItems } from '@/state/prefs/hidden-items';
import { useTraktMediaImages } from '@/state/queries/trakt';
import type { DiaryDay, MergedDiaryEntry, NormalizedMediaItem } from '@/types/media';

import {
  clusterDayEntries,
  formatClusterCount,
  formatDayParts,
  formatEpisodeDetail,
  formatLogTime,
  shortClusterCount,
  summarizeCluster,
  type DiaryCluster,
  type DiaryDayParts,
} from './merge';

/**
 * The rail: a fixed-width left gutter every row shares, carrying one continuous
 * hairline down the diary. The date lives *in* the gutter at the top of each
 * day instead of in a band above the rows, so scroll position always states
 * what day you are in without a sticky header covering content — and the rail
 * itself is the connection between an episode run and its episodes, which is
 * why the old `├─`/`└─` tree connectors (and their pixel-exact `top-[22px]`
 * geometry) are gone.
 *
 * Kept flat, not nested in per-day containers: the list virtualizes one stream
 * of rows, so a day cannot own a wrapping View without defeating it.
 */
const RAIL_W = 'w-14';
/** Centre of `RAIL_W` (56px), where the hairline sits. */
const RAIL_LINE = 'left-7';
/**
 * The two class strings that set a row's height, named once because
 * `DiaryListSkeleton` has to reproduce it exactly — a skeleton whose rows are a
 * different height than the real ones *is* the layout shift. The poster is the
 * tallest thing in a row (54 > title + detail), so it and the vertical padding
 * are the whole geometry: 54 + 6 + 6 = 66px.
 */
const ROW_BODY = 'flex-1 py-1.5 pr-6';
const POSTER = 'w-9 h-[54px] rounded';

/** Flattened list rows: a day's gutter head, then that day's entries. */
type DiaryListItem =
  | {
      kind: 'header';
      key: string;
      dayKey: string;
      parts: DiaryDayParts;
      count: number;
      collapsed: boolean;
    }
  | { kind: 'entry'; key: string; entry: MergedDiaryEntry }
  | {
      kind: 'cluster';
      key: string;
      cluster: DiaryCluster;
      /** Precomputed at flatten time — see `clusterView`. */
      view: ClusterView;
      expanded: boolean;
    }
  | { kind: 'child'; key: string; entry: MergedDiaryEntry; last: boolean };

/**
 * Everything a collapsed run's row displays, derived once per cluster instead
 * of once per render.
 *
 * This is not premature: `summarizeCluster` unions and sorts every entry's
 * episodes and providers, and `formatEpisodeDetail` sorts them again. With
 * recycling on, a cluster row is re-rendered with a different cluster every
 * time it scrolls past — profiling put one such render at 126ms, the single
 * worst frame in the session. Flattening already walks each cluster exactly
 * once, so it is the honest home for this.
 */
interface ClusterView {
  item: NormalizedMediaItem;
  providers: ProviderId[];
  /** "S1E12–14", or the spelled-out count when the run has no range. */
  detail: string;
  /** The trailing pill: "3 eps" / "4 ch". */
  runCount: string;
  /** "Frieren, 3 episodes" — the row's accessible name. */
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
    item: summary.item,
    providers: summary.providers,
    detail: range !== '' ? range : spelled,
    runCount: shortClusterCount(summary),
    label: `${summary.item.title}, ${spelled}`,
  };
}

function flattenDays(
  days: DiaryDay[],
  now: Date,
  timeZone: string,
  expanded: ReadonlySet<string>,
  collapsedDays: ReadonlySet<string>,
  hiddenIds: ReadonlySet<string>,
): DiaryListItem[] {
  const items: DiaryListItem[] = [];
  for (const day of days) {
    // Hiding is one global set (feed, watchlist, Up Next, diary), so a hidden
    // item's logs drop out here too — and a day left with nothing loses its
    // header rather than standing empty.
    const entries =
      hiddenIds.size === 0
        ? day.entries
        : day.entries.filter((entry) => !hiddenIds.has(entry.item.id));
    if (entries.length === 0) continue;
    const collapsed = collapsedDays.has(day.key);
    items.push({
      kind: 'header',
      key: `h-${day.key}`,
      dayKey: day.key,
      parts: formatDayParts(day.key, now, timeZone),
      count: entries.length,
      collapsed,
    });
    // A minimized day shows its gutter head alone — its rows are omitted.
    if (collapsed) continue;
    for (const cluster of clusterDayEntries(entries)) {
      // A lone log is an ordinary row; a run of same-show episodes collapses.
      if (cluster.entries.length === 1) {
        const entry = cluster.entries[0];
        items.push({ kind: 'entry', key: entry.id, entry });
        continue;
      }
      const isOpen = expanded.has(cluster.key);
      items.push({
        kind: 'cluster',
        key: `c-${cluster.key}`,
        cluster,
        view: clusterView(cluster),
        expanded: isOpen,
      });
      if (isOpen) {
        cluster.entries.forEach((entry, index) =>
          items.push({
            kind: 'child',
            key: entry.id,
            entry,
            last: index === cluster.entries.length - 1,
          }),
        );
      }
    }
  }
  return items;
}

/**
 * The hairline segment a non-header row contributes to the rail. `stop` ends it
 * halfway down — the last row of a day, so the rail terminates with the day
 * rather than running into the next one's date.
 */
function RailLine({ stop = false }: { stop?: boolean }) {
  return (
    <View className={cn(RAIL_W, 'relative')}>
      <View
        className={cn(
          'absolute w-px bg-border top-0',
          RAIL_LINE,
          stop ? 'h-1/2' : 'bottom-0',
        )}
      />
    </View>
  );
}

/**
 * A day's head: the date stacked in the gutter (numeral over month), the entry
 * count beneath it, and a hairline reaching right with the collapse chevron at
 * its end. The whole row is the collapse target — the same persisted
 * `collapsed-diary-days` gesture as before, given a wider and more obvious
 * surface than the old 14px chevron.
 */
function DiaryDayHead({
  parts,
  count,
  collapsed,
  onToggle,
}: {
  parts: DiaryDayParts;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const muted = useCSSVariable('--color-muted');
  return (
    <PresstableOpacity
      accessibilityHint={collapsed ? 'Expands this day' : 'Minimizes this day'}
      accessibilityLabel={`${parts.label} ${parts.day}, ${count} ${count === 1 ? 'entry' : 'entries'}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      className="flex-row pt-5"
      onPress={onToggle}
    >
      <View className={cn(RAIL_W, 'items-center relative')}>
        <Text
          className={cn(
            'font-display text-2xl leading-none',
            parts.isToday ? 'text-accent' : 'text-foreground',
          )}
        >
          {parts.day}
        </Text>
        <Text className="text-muted font-sans-semibold text-[9px] uppercase tracking-widest mt-1">
          {parts.label}
        </Text>
        {/* The rail picks up below the date block, so the hairline runs
            unbroken from one day into the next rather than restarting. */}
        <View className={cn('absolute w-px bg-border top-11 bottom-0', RAIL_LINE)} />
      </View>
      <View className="flex-1 flex-row items-center pr-6 pb-3">
        {/* The count lives out here, not stacked under the date: in the gutter
            a bare numeral under "18 AUG" reads as part of the date. */}
        <Text className="text-muted/70 font-sans text-[11px] mr-3">
          {count} {count === 1 ? 'entry' : 'entries'}
        </Text>
        <View className="flex-1 h-px bg-border" />
        <Ionicons
          color={typeof muted === 'string' ? muted : undefined}
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={14}
          style={{ marginLeft: 10 }}
        />
      </View>
    </PresstableOpacity>
  );
}

/**
 * The providers that logged this entry, as their own brand dots rather than
 * their marks. Two reasons: at 16px the marks read as noise beside a 36px
 * poster, and each one was an `expo-image` — three image views per row across a
 * list this long is real mount cost the dots do not pay. The wrapping label
 * still names every provider, since nothing adjacent does.
 */
function ProviderDots({ providers }: { providers: ProviderId[] }) {
  const names = providers.map((id) => PROVIDERS[id].label).join(', ');
  return (
    <View
      accessibilityLabel={`Logged via ${names}`}
      className="flex-row items-center gap-1 flex-none"
    >
      {providers.map((id) => (
        <View className={cn('w-1.5 h-1.5 rounded-full', PROVIDER_DOT[id])} key={id} />
      ))}
    </View>
  );
}

/** The 36×54 rail poster, lazily recovered when the log arrives artless. */
function DiaryPoster({ item }: { item: NormalizedMediaItem }) {
  // Trakt history rows arrive artless (2026 API dropped images from sync
  // endpoints) — recover the poster lazily per rendered row, like the cards.
  const { coverImage } = useTraktMediaImages(item);
  if (coverImage === '') return <PosterPlaceholder className={POSTER} />;
  return (
    <Image
      source={{ uri: coverImage }}
      className={cn(POSTER, 'bg-surface border border-border/50')}
      contentFit="cover"
      recyclingKey={item.id}
    />
  );
}

/**
 * A stack of up to three posters for a collapsed episode run — the run reads as
 * more-than-one before its count does. Only the front poster is a real image;
 * the two behind it are inert tinted plates, so a fan costs no more requests
 * than a single row.
 */
function PosterFan({ item }: { item: NormalizedMediaItem }) {
  return (
    <View className="w-[46px] h-[54px] flex-none">
      <View className="absolute left-[10px] top-[3px] w-9 h-12 rounded bg-surface border border-border/40" />
      <View className="absolute left-[5px] top-[1px] w-9 h-[52px] rounded bg-surface border border-border/50" />
      <View className="absolute left-0 top-0">
        <DiaryPoster item={item} />
      </View>
    </View>
  );
}

/**
 * The right edge of every row: the time of day (or, for a collapsed run, its
 * episode-count pill), then the provider dots. One component rather than two
 * siblings because the gap between the time and the first dot has to come from
 * somewhere — as separate children of `ActionableRow`'s trailing slot they sit
 * flush against each other and the time reads as if the dot were punctuation.
 */
function RowTrailing({
  providers,
  time,
  runCount,
}: {
  providers: ProviderId[];
  time?: string;
  runCount?: string;
}) {
  return (
    <View className="flex-row items-center gap-2.5 pl-3">
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
      <ProviderDots providers={providers} />
    </View>
  );
}

function DiaryRow({
  entry,
  timeZone,
  last,
  onOpen,
  onActions,
}: {
  entry: MergedDiaryEntry;
  timeZone: string;
  last: boolean;
  onOpen: (id: string) => void;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  const detail = formatEpisodeDetail({
    type: entry.item.type,
    ...(entry.season != null ? { season: entry.season } : {}),
    episodes: entry.episodes,
  });

  return (
    <View className="flex-row">
      <RailLine stop={last} />
      <ActionableRow
        className={ROW_BODY}
        href={routes.details(entry.item.id)}
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
        onPress={() => onOpen(entry.item.id)}
        trailing={
          <RowTrailing
            providers={entry.providers}
            time={formatLogTime(entry, timeZone)}
          />
        }
      />
    </View>
  );
}

/**
 * The collapsed head of a same-show episode run (S6E1…E10 → one row). Tapping
 * anywhere toggles the run open; the episode logs then render below as
 * `DiaryChildRow`s, indented off the same rail.
 */
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
      <RailLine stop={last && !expanded} />
      <ActionableRow
        accessibility={{
          accessibilityHint: expanded ? 'Collapses this run' : 'Expands this run',
          accessibilityLabel: view.label,
          accessibilityRole: 'button',
          accessibilityState: { expanded },
        }}
        className={ROW_BODY}
        // ⌘/Ctrl+click opens the show in a new tab even though a plain press
        // toggles the run — the modifier means the same thing on every row.
        href={routes.details(view.item.id)}
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
        trailing={
          <RowTrailing providers={view.providers} runCount={view.runCount} />
        }
      />
    </View>
  );
}

/** One episode log inside an expanded run — indented off the rail, no poster. */
function DiaryChildRow({
  entry,
  timeZone,
  last,
  onOpen,
  onActions,
}: {
  entry: MergedDiaryEntry;
  timeZone: string;
  last: boolean;
  onOpen: (id: string) => void;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  const detail = formatEpisodeDetail({
    type: entry.item.type,
    ...(entry.season != null ? { season: entry.season } : {}),
    episodes: entry.episodes,
  });

  return (
    <View className="flex-row">
      <RailLine stop={last} />
      <ActionableRow
        className="flex-1 h-9 pr-6 pl-3"
        href={routes.details(entry.item.id)}
        item={entry.item}
        leading={
          <Text className="shrink text-muted font-sans text-[13px]" numberOfLines={1}>
            {detail !== '' ? detail : entry.item.title}
          </Text>
        }
        onActions={onActions}
        onPress={() => onOpen(entry.item.id)}
        trailing={
          <RowTrailing
            providers={entry.providers}
            time={formatLogTime(entry, timeZone)}
          />
        }
      />
    </View>
  );
}

/**
 * The R10 partial-failure banner: persistent (non-dismissible), names the
 * failed provider(s), tap-to-retry. Shown over the entries that did load,
 * never a blank screen (same contract as the feed and the log fan-out).
 */
function DiaryFailureBanner({
  providers,
  onRetry,
}: {
  providers: ProviderId[];
  onRetry: () => void;
}) {
  const accent = useCSSVariable('--color-accent');
  const names = providers.map((id) => PROVIDERS[id].label).join(', ');
  return (
    <PresstableOpacity
      accessibilityLabel={`Retry loading ${names}`}
      className="mx-6 mt-3 flex-row items-center gap-2.5 rounded bg-surface border border-border px-4 py-3"
      onPress={onRetry}
    >
      <Ionicons
        color={typeof accent === 'string' ? accent : undefined}
        name="warning-outline"
        size={16}
      />
      <Text className="flex-1 text-foreground font-sans text-sm">
        Couldn&apos;t load {names}. Tap to retry.
      </Text>
    </PresstableOpacity>
  );
}

/**
 * Fixed height whether or not a page is in flight. The previous version
 * swapped a 96px spacer for a ~68px spinner block, so the bottom of the list
 * jumped every time infinite scroll fired — the spinner is centred inside the
 * spacer instead, and nothing moves.
 */
function DiaryFooter({ loading }: { loading: boolean }) {
  return (
    <View className="h-24 items-center justify-center">
      {loading && <ActivityIndicator />}
    </View>
  );
}

/**
 * The first-load placeholder, laid out on the same rail as the real list and
 * built from the same `ROW_BODY`/`POSTER`/`RAIL_W` constants — so switching
 * from skeleton to data moves nothing. Two things make that true: a row's
 * height comes entirely from the poster plus vertical padding (the title and
 * detail together are shorter than 54px), and the day head's height comes
 * entirely from its gutter, whose numeral and month label the bars below
 * mirror at the same sizes.
 *
 * Horizontal alignment holds on web too, where `ActionableRow` reserves a 40px
 * slot for the hover ⋯: the skeleton's bars are fixed widths rather than text,
 * so nothing reflows when that slot appears alongside real content.
 */
function SkeletonDayHead() {
  return (
    <View className="flex-row pt-5">
      <View className={cn(RAIL_W, 'items-center relative')}>
        {/* 24px tall: `font-display text-2xl leading-none`. */}
        <Skeleton className="w-7 h-6 rounded" />
        <Skeleton className="w-6 h-3 rounded mt-1" />
        <View className={cn('absolute w-px bg-border top-11 bottom-0', RAIL_LINE)} />
      </View>
      <View className="flex-1 flex-row items-center pr-6 pb-3">
        <Skeleton className="h-2.5 w-16 rounded mr-3" />
        <View className="flex-1 h-px bg-border" />
      </View>
    </View>
  );
}

/** Cycled rather than random so the placeholder is stable across renders. */
const SKELETON_TITLE_WIDTHS = ['w-2/3', 'w-1/2', 'w-3/5', 'w-5/12'];

function SkeletonRow({ index, last }: { index: number; last: boolean }) {
  return (
    <View className="flex-row">
      <RailLine stop={last} />
      <View className={cn(ROW_BODY, 'flex-row items-center')}>
        <Skeleton className={POSTER} />
        <View className="flex-1 ml-3">
          <Skeleton
            className={cn(
              'h-3.5 rounded',
              SKELETON_TITLE_WIDTHS[index % SKELETON_TITLE_WIDTHS.length],
            )}
          />
          <Skeleton className="h-2.5 w-14 rounded mt-1.5" />
        </View>
        <Skeleton className="h-2 w-8 rounded ml-3" />
      </View>
    </View>
  );
}

/** Day sizes that read as a plausible diary rather than a uniform block. */
const SKELETON_DAYS = [3, 4, 3];

export function DiaryListSkeleton() {
  return (
    <View>
      {SKELETON_DAYS.map((rows, day) => (
        <View key={day}>
          <SkeletonDayHead />
          {Array.from({ length: rows }).map((_, row) => (
            <SkeletonRow index={day + row} key={row} last={row === rows - 1} />
          ))}
        </View>
      ))}
    </View>
  );
}

export interface DiaryListProps {
  days: DiaryDay[];
  timeZone: string;
  failedProviders: ProviderId[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onEndReached: () => void;
  onRetry: () => void;
  onRefresh: () => Promise<unknown>;
  onOpen: (id: string) => void;
  /** Opens the card actions dialog — long-press, or the web hover ⋯. */
  onItemActions: (item: NormalizedMediaItem) => void;
}

/**
 * The virtualized diary list (plan 0016 R7), laid out on the rail: a gutter
 * head per day, rows hanging off one continuous hairline, infinite scroll via
 * `onEndReached`, pull-to-refresh, the R10 failure banner as a persistent list
 * header, and a footer spinner while a page is in flight.
 */
export function DiaryList({
  days,
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
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<LegendListRef>(null);
  // Whether the list is far enough down that "back to top" earns its pixels.
  // Flipped only on threshold crossings, so scrolling doesn't re-render.
  const [showScrollTop, setShowScrollTop] = useState(false);
  // Which episode clusters are open. Expansion is ephemeral view state that
  // lives here in the list (not in a recycled row), keyed by the cluster's
  // stable anchor id — unlike day-minimize, which persists across restarts.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const collapsedDays = useCollapsedDiaryDays();
  const hiddenIds = new Set(useHiddenItems().map((item) => item.id));
  const items = flattenDays(
    days,
    new Date(),
    timeZone,
    expanded,
    collapsedDays,
    hiddenIds,
  );

  function toggleCluster(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleDay(dayKey: string) {
    setDiaryDayCollapsed(dayKey, !collapsedDays.has(dayKey));
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  // Double-tapping the Diary tab runs the same refresh the pull gesture does,
  // spinner included (`app/(tabs)/_layout.tsx` emits the press). The tab name
  // is fixed here rather than passed in because this list *is* that tab's
  // surface — it renders nowhere else.
  useTabDoubleTap('diary', () => void refresh());

  /** A row is a day's last when the next item starts a new day (or ends it). */
  function isLastOfDay(index: number) {
    const next = items[index + 1];
    return next == null || next.kind === 'header';
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const past = event.nativeEvent.contentOffset.y > SCROLL_TO_TOP_THRESHOLD;
    if (past !== showScrollTop) setShowScrollTop(past);
  }

  return (
    <View className="flex-1">
      <List
        ref={listRef}
        onScroll={handleScroll}
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={({ item, index }) => {
          switch (item.kind) {
            case 'header':
              return (
                <DiaryDayHead
                  collapsed={item.collapsed}
                  count={item.count}
                  onToggle={() => toggleDay(item.dayKey)}
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
                  last={isLastOfDay(index)}
                  onActions={onItemActions}
                  onOpen={onOpen}
                  timeZone={timeZone}
                />
              );
          }
        }}
        ListHeaderComponent={
          failedProviders.length > 0 ? (
            <DiaryFailureBanner onRetry={onRetry} providers={failedProviders} />
          ) : undefined
        }
        ListFooterComponent={
          <DiaryFooter loading={hasNextPage && isFetchingNextPage} />
        }
        // Rows come in three very different heights (~72 head, 66 entry, 36
        // child). `getItemType` lets the virtualizer keep a running average per
        // kind instead of one blended number, so a screenful of day heads
        // doesn't mis-estimate the scroll extent of the entries below them.
        // Deliberately hints, not `getFixedItemSize`: the geometry lives in the
        // rows' class names and must not be duplicated here.
        estimatedItemSize={66}
        getItemType={(item) => item.kind}
        onEndReached={hasNextPage ? onEndReached : undefined}
        onEndReachedThreshold={0.6}
        // The one list in the app that opts into recycling, and it is measured,
        // not assumed: profiling a scroll over ~1,300 logs put a 332ms commit on
        // the mount of a single screenful of rows — 45% of it in the
        // gesture-handler pressable stack that every row re-creates from
        // scratch. Recycling reuses those fibers instead. Safe here because
        // every diary row derives from props: the poster resolves off the item
        // id, day-collapse lives in MMKV and run-expansion in this component,
        // never in a row. The one piece of row-local state is `ActionableRow`'s
        // web hover flag, which can briefly show a stale ⋯ on a recycled row
        // until the next pointer move.
        // ponytail: revisit if hover ever drives anything but that button.
        recycleItems
        refreshControl={
          <RefreshControl onRefresh={refresh} refreshing={refreshing} />
        }
      />
      <ScrollToTopFab
        onPress={() => void listRef.current?.scrollToOffset({ offset: 0 })}
        visible={showScrollTop}
      />
    </View>
  );
}
