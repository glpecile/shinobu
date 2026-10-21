import { useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import Ionicons from '@react-native-vector-icons/ionicons/static';
import {
  RefreshControl,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

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
import { SectionEnter } from '@/components/section-enter';
import { SmallPoster } from '@/components/small-poster';
import { ProviderIcon } from '@/components/provider-icon';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { Spinner } from '@/components/spinner';
import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';
import { DURATION, EASE_IN_OUT, EASE_OUT } from '@/lib/motion';
import { useListDisclosure } from '@/lib/use-list-disclosure';
import { useTabDoubleTap } from '@/lib/navigation/tab-double-tap';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import {
  setDiaryDayCollapsed,
  useCollapsedDiaryDays,
} from '@/state/prefs/collapsed-diary-days';
import { matchesFormat, type FormatFilter } from '@/features/credit-timeline/group';
import { useHiddenItems } from '@/state/prefs/hidden-items';
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
  summarizeDay,
  type DaySummary,
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
 * of rows, so a day cannot own a wrapping View without defeating it. The rail's
 * own geometry lives with the head it shares with the filmography
 * (`components/rail-head`).
 */

/**
 * The scrolled-past day pinned under the Diary header (beside its title on
 * web), standing in for the day head once it leaves the top. It covers the list rather than sitting
 * above it, so showing and hiding it never moves a row. It stays mounted and
 * keeps its last day while hidden, so the fade out never shows an empty bar.
 */
function DiaryStickyDate({
  label,
  summary,
  visible,
}: {
  label: string;
  summary: string;
  visible: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatedView
      accessibilityElementsHidden={!visible}
      accessibilityRole="header"
      className="absolute top-0 left-0 right-0 flex-row items-baseline px-6 py-2 bg-background border-b border-border"
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={{
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        // Drops in from under the Diary header as the day head scrolls up into it.
        transform: [{ translateY: visible ? 0 : -6 }],
        transitionProperty: ['opacity', 'transform'],
        transitionDuration: reduceMotion ? 0 : visible ? DURATION.enter : DURATION.exit,
        transitionTimingFunction: EASE_OUT,
      }}
    >
      <Text className="font-display text-base text-foreground">{label}</Text>
      <Text className="ml-3 shrink text-muted font-sans text-xs" numberOfLines={1}>
        {summary}
      </Text>
    </AnimatedView>
  );
}

/**
 * The two class strings that set a row's height, named once because
 * `DiaryListSkeleton` has to reproduce it exactly — a skeleton whose rows are a
 * different height than the real ones *is* the layout shift. The poster is the
 * tallest thing in a row (54 > title + detail), so it and the vertical padding
 * are the whole geometry: 54 + 6 + 6 = 66px.
 */
const ROW_BODY = 'flex-1 py-1.5 pr-6';
const POSTER = 'w-9 h-13.5 rounded';

/** Flattened list rows: a month's calendar, each day's gutter head, then that day's entries. */
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
      /** Precomputed at flatten time — see `clusterView`. */
      view: ClusterView;
      expanded: boolean;
    }
  | { kind: 'child'; key: string; dayKey: string; entry: MergedDiaryEntry; last: boolean };

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
  liked: boolean;
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
    liked: cluster.entries.some((entry) => entry.liked === true),
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
  keep: (entry: MergedDiaryEntry) => boolean,
  inlineMonths: boolean,
): { items: DiaryListItem[]; activity: Map<string, DaySummary> } {
  const items: DiaryListItem[] = [];
  const activity = new Map<string, DaySummary>();
  let month = '';
  for (const day of days) {
    // A day left with nothing after hiding or the format filter loses its
    // header rather than standing empty, and drops out of the calendar.
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
      parts: formatDayParts(day.key, now, timeZone),
      summary: summary.label,
      collapsed,
    });
    // A minimized day shows its gutter head alone — its rows are omitted.
    if (collapsed) continue;
    for (const cluster of clusterDayEntries(entries)) {
      // A lone log is an ordinary row; a run of same-show episodes collapses.
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

/**
 * The hairline segment a non-header row contributes to the rail. `stop` ends it
 * halfway down — the last row of a day, so the rail terminates with the day
 * rather than running into the next one's date.
 */
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

/**
 * A day's head on the shared rail head; the whole row is the collapse target,
 * the same persisted `collapsed-diary-days` gesture as before.
 */
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

/**
 * The providers that logged this entry, as their brand marks. The wrapping
 * label still names every provider, since nothing adjacent does.
 */
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

/** The 36×54 rail poster, lazily recovered when the log arrives artless. */
function DiaryPoster({ item }: { item: NormalizedMediaItem }) {
  const { coverImage: providerCover } = useTraktMediaImages(item);
  // Serializd's sparse logs carry a TMDB TV ID; reuse detail metadata only
  // when provider recovery has no art, without delaying the diary page.
  const { data: details } = useMediaDetailsQuery(
    providerCover === '' && item.externalIds.tmdb != null ? item : undefined,
  );
  const coverImage = providerCover || details?.catalogue?.coverImage || '';
  return <SmallPoster uri={coverImage} recyclingKey={item.id} size="sm" />;
}

/**
 * A stack of up to three posters for a collapsed episode run — the run reads as
 * more-than-one before its count does. Only the front poster is a real image;
 * the two behind it are inert tinted plates, so a fan costs no more requests
 * than a single row.
 */
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

/**
 * The right edge of every row: a heart for liked logs, the time of day (or, for
 * a collapsed run, its episode-count pill), then the provider dots. One component rather than two
 * siblings because the gap between the time and the first dot has to come from
 * somewhere — as separate children of `ActionableRow`'s trailing slot they sit
 * flush against each other and the time reads as if the dot were punctuation.
 */
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

/**
 * Where a log opens: its episode when the log is one episode the episode route
 * can address — a TV season pointer, or an anime entry number the route places
 * itself — else the show (movies, chapter logs, ranges).
 */
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
  onOpen,
  onActions,
}: {
  entry: MergedDiaryEntry;
  timeZone: string;
  last: boolean;
  onOpen: (href: string) => void;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  const detail = formatEpisodeDetail({
    type: entry.item.type,
    ...(entry.season != null ? { season: entry.season } : {}),
    episodes: entry.episodes,
  });
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
      <RailLine key={clusterKey} stop={last && !expanded} />
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
        trailing={
          <RowTrailing liked={view.liked} providers={view.providers} runCount={view.runCount} />
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
  onOpen: (href: string) => void;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  const detail = formatEpisodeDetail({
    type: entry.item.type,
    ...(entry.season != null ? { season: entry.season } : {}),
    episodes: entry.episodes,
  });
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

/**
 * The R10 partial-failure banner: persistent (non-dismissible), names the
 * failed provider(s), tap-to-retry. Shown over the entries that did load,
 * never a blank screen (same contract as the feed and the log fan-out).
 *
 * It is a button, so it is `components/button` — a quiet centred pill that hugs its
 * label rather than a full-bleed bar, which is what kept reading as an alert
 * the list couldn't get rid of. The glyph is the app's retry verb; the label
 * says what failed.
 */
function DiaryFailureBanner({
  providers,
  onRetry,
}: {
  providers: ProviderId[];
  onRetry: () => void;
}) {
  const names = providers.map((id) => PROVIDERS[id].label).join(', ');
  return (
    <Button
      accessibilityLabel={`Retry loading ${names}`}
      className="self-center mt-3 mb-4"
      icon={<Button.Icon name="refresh" />}
      label={`Couldn\u2019t load ${names}`}
      onPress={onRetry}
      size="sm"
      variant="quiet"
    />
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
    <View accessibilityLabel={loading ? 'Loading more entries' : undefined} className="h-24 items-center justify-center">
      {loading && <Spinner />}
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
/** Cycled rather than random so the placeholder is stable across renders. */
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

/** Day sizes that read as a plausible diary rather than a uniform block. */
const SKELETON_DAYS = [3, 4, 3];

/**
 * From here the month calendar moves out of the list into a column beside it:
 * a wide web window has the room, and full-width rows only stretch.
 */
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
  /** Narrows rows, the calendar, and its stats; manga shows only under All. */
  format: FormatFilter;
  timeZone: string;
  failedProviders: ProviderId[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onEndReached: () => void;
  onRetry: () => void;
  onRefresh: () => Promise<unknown>;
  onOpen: (href: string) => void;
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
  format,
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
  const { expanded, toggle: toggleCluster } = useListDisclosure();
  const collapsedDays = useCollapsedDiaryDays();
  const hiddenIds = new Set(useHiddenItems().map((item) => item.id));
  const muted = useThemeColor('--color-muted');
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
  }
  const now = new Date();
  const wide = useWindowDimensions().width >= SIDE_CALENDAR_MIN_WIDTH;
  const { items, activity } = flattenDays(
    days,
    now,
    timeZone,
    expanded,
    collapsedDays,
    // Hiding is one global set (feed, watchlist, Up Next, diary).
    (entry) => !hiddenIds.has(entry.item.id) && matchesFormat(entry.item, format),
    !wide,
  );

  const [sticky, setSticky] = useState<{ day: string | null; visible: boolean }>({
    day: null,
    visible: false,
  });
  const [visibleMonth, setVisibleMonth] = useState<string | null>(null);
  const stickyHeader = items.find(
    (item): item is Extract<DiaryListItem, { kind: 'header' }> =>
      item.kind === 'header' && item.dayKey === sticky.day,
  );

  const activityProps = {
    activity,
    // Days arrive newest-first; the last is as far back as the feed has loaded.
    // Once there's no next page, the history is complete and earlier days are empty.
    oldest: hasNextPage ? (days.at(-1)?.key ?? '') : '',
    today: dayKeyForInstant(now, timeZone),
    loadingMore: isFetchingNextPage,
    onLoadMore: onEndReached,
    onSelectDay: (dayKey: string) => {
      const index = items.findIndex((item) => item.kind === 'header' && item.dayKey === dayKey);
      if (index !== -1) void listRef.current?.scrollToIndex({ index });
    },
  };

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
    return next == null || next.kind === 'header' || next.kind === 'month';
  }

  /** The topmost row's day, once its own head has scrolled away. */
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
    // Hiding keeps the last day so the bar fades out with its content.
    setSticky((previous) => {
      if (day == null) return previous.visible ? { ...previous, visible: false } : previous;
      return previous.visible && previous.day === day ? previous : { day, visible: true };
    });
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const past = event.nativeEvent.contentOffset.y > SCROLL_TO_TOP_THRESHOLD;
    if (past !== showScrollTop) setShowScrollTop(past);
  }

  const sideMonth = visibleMonth ?? (days[0]?.key ?? activityProps.today).slice(0, 7);

  return (
    <View className="flex-1 flex-row">
      <View className="flex-1">
        <List
          ref={listRef}
          onScroll={handleScroll}
          data={items}
          keyExtractor={(item) => item.key}
          renderItem={({ item, index }) => {
            switch (item.kind) {
              case 'month':
                // Older months sit under the previous day's rows, not the header.
                // Keyed so a recycled slot remounts instead of animating from
                // the previous month's shading and numbers.
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
          // Rows come in four very different heights (~300 month, ~72 head, 66
          // entry, 36 child). `getItemType` lets the virtualizer keep a running
          // average per kind instead of one blended number, so a screenful of day heads
          // doesn't mis-estimate the scroll extent of the entries below them.
          // Size the initial pool for a viewport of expanded children, the
          // shortest rows. These remain estimates so larger fonts can remeasure.
          estimatedItemSize={36}
          getItemType={(item) => item.kind}
          onEndReached={hasNextPage ? onEndReached : undefined}
          onEndReachedThreshold={0.6}
          onViewableItemsChanged={handleViewableItemsChanged}
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
        {stickyHeader != null && (
          <DiaryStickyDate
            label={formatDayDate(stickyHeader.dayKey, activityProps.today)}
            summary={stickyHeader.summary}
            visible={sticky.visible}
          />
        )}
        <ScrollToTopFab
          className="ios:bottom-24"
          onPress={() => void listRef.current?.scrollToOffset({ offset: 0 })}
          visible={showScrollTop}
        />
      </View>
      {wide && (
        <View className={SIDE_CALENDAR}>
          <SectionEnter key={sideMonth}>
            <DiaryMonth month={sideMonth} stacked {...activityProps} />
          </SectionEnter>
        </View>
      )}
    </View>
  );
}
