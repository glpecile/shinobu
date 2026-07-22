import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Image } from '@/components/image';
import { List } from '@/components/List';
import { PresstableScale, PresstableOpacity } from '@/components/presstable';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { ProviderIcon } from '@/components/provider-icon';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import {
  setDiaryDayCollapsed,
  useCollapsedDiaryDays,
} from '@/state/prefs/collapsed-diary-days';
import { useTraktMediaImages } from '@/state/queries/trakt';
import type { DiaryDay, MergedDiaryEntry, NormalizedMediaItem } from '@/types/media';

import {
  clusterDayEntries,
  formatClusterCount,
  formatDayHeader,
  formatEpisodeDetail,
  summarizeCluster,
  type DiaryCluster,
} from './merge';

/** Flattened list rows: a sticky-ish day header, then that day's entries. */
type DiaryListItem =
  | {
      kind: 'header';
      key: string;
      dayKey: string;
      label: string;
      count: number;
      collapsed: boolean;
    }
  | { kind: 'entry'; key: string; entry: MergedDiaryEntry }
  | { kind: 'cluster'; key: string; cluster: DiaryCluster; expanded: boolean }
  | { kind: 'child'; key: string; entry: MergedDiaryEntry; last: boolean };

function flattenDays(
  days: DiaryDay[],
  now: Date,
  timeZone: string,
  expanded: ReadonlySet<string>,
  collapsedDays: ReadonlySet<string>,
): DiaryListItem[] {
  const items: DiaryListItem[] = [];
  for (const day of days) {
    const collapsed = collapsedDays.has(day.key);
    items.push({
      kind: 'header',
      key: `h-${day.key}`,
      dayKey: day.key,
      label: formatDayHeader(day.key, now, timeZone),
      count: day.entries.length,
      collapsed,
    });
    // A minimized day shows its header alone — its rows are omitted entirely.
    if (collapsed) continue;
    for (const cluster of clusterDayEntries(day.entries)) {
      // A lone log is an ordinary row; a run of same-show episodes collapses.
      if (cluster.entries.length === 1) {
        const entry = cluster.entries[0];
        items.push({ kind: 'entry', key: entry.id, entry });
        continue;
      }
      const isOpen = expanded.has(cluster.key);
      items.push({ kind: 'cluster', key: `c-${cluster.key}`, cluster, expanded: isOpen });
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

function DiaryDayHeader({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const muted = useCSSVariable('--color-muted');
  return (
    <PresstableOpacity
      accessibilityHint={collapsed ? 'Expands this day' : 'Minimizes this day'}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      className="flex-row items-center px-6 pt-5 pb-1.5"
      onPress={onToggle}
    >
      <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider">
        {label}
      </Text>
      {collapsed && (
        <Text className="text-muted/60 font-sans text-xs ml-2">
          {count} {count === 1 ? 'entry' : 'entries'}
        </Text>
      )}
      <View className="flex-1" />
      <Ionicons
        color={typeof muted === 'string' ? muted : undefined}
        name={collapsed ? 'chevron-down' : 'chevron-up'}
        size={14}
      />
    </PresstableOpacity>
  );
}

/** The provider marks that logged this entry, with a wrapping a11y label —
 *  unlike every other ProviderIcon call site, no adjacent text names them. */
function ProviderCluster({ providers }: { providers: ProviderId[] }) {
  const names = providers.map((id) => PROVIDERS[id].label).join(', ');
  return (
    <View
      accessibilityLabel={`Logged via ${names}`}
      className="flex-row items-center gap-1.5"
    >
      {providers.map((id) => (
        <ProviderIcon id={id} key={id} size={16} />
      ))}
    </View>
  );
}

/** The 48×72 poster for a diary row, lazily recovered when the log is artless. */
function DiaryPoster({ item }: { item: NormalizedMediaItem }) {
  // Trakt history rows arrive artless (2026 API dropped images from sync
  // endpoints) — recover the poster lazily per rendered row, like the cards.
  const { coverImage } = useTraktMediaImages(item);
  if (coverImage === '') return <PosterPlaceholder className="w-12 h-[72px] rounded" />;
  return (
    <Image
      source={{ uri: coverImage }}
      className="w-12 h-[72px] rounded bg-surface border border-border/50"
      contentFit="cover"
      recyclingKey={item.id}
    />
  );
}

function DiaryRow({
  entry,
  onOpen,
}: {
  entry: MergedDiaryEntry;
  onOpen: (id: string) => void;
}) {
  const detail = formatEpisodeDetail({
    type: entry.item.type,
    ...(entry.season != null ? { season: entry.season } : {}),
    episodes: entry.episodes,
  });

  return (
    <PresstableScale
      className="flex-row items-center px-6 py-2.5"
      onPress={() => onOpen(entry.item.id)}
    >
      <DiaryPoster item={entry.item} />
      <View className="flex-1 ml-4">
        <Text
          className="text-foreground font-sans-semibold text-base"
          numberOfLines={1}
        >
          {entry.item.title}
        </Text>
        {detail !== '' && (
          <Text className="text-muted font-sans text-xs mt-1">{detail}</Text>
        )}
      </View>
      <ProviderCluster providers={entry.providers} />
    </PresstableScale>
  );
}

/**
 * The collapsed head of a same-show episode run (S6E1…E10 → one row). Tapping
 * anywhere toggles the run open; the chevron mirrors state. When open, the
 * individual episode logs render below as `DiaryChildRow`s.
 */
function DiaryClusterRow({
  cluster,
  expanded,
  onToggle,
}: {
  cluster: DiaryCluster;
  expanded: boolean;
  onToggle: (key: string) => void;
}) {
  const muted = useCSSVariable('--color-muted');
  const summary = summarizeCluster(cluster);
  const range = formatEpisodeDetail({
    type: summary.item.type,
    ...(summary.season != null ? { season: summary.season } : {}),
    episodes: summary.episodes,
  });
  const count = formatClusterCount(summary.item.type, summary.count);
  const detail = range !== '' ? `${range} · ${count}` : count;

  return (
    <PresstableScale
      accessibilityHint={expanded ? 'Collapses this run' : 'Expands this run'}
      accessibilityLabel={`${summary.item.title}, ${count}`}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      className="flex-row items-center px-6 py-2.5"
      onPress={() => onToggle(cluster.key)}
    >
      <DiaryPoster item={summary.item} />
      <View className="flex-1 ml-4">
        <Text
          className="text-foreground font-sans-semibold text-base"
          numberOfLines={1}
        >
          {summary.item.title}
        </Text>
        <Text className="text-muted font-sans text-xs mt-1">{detail}</Text>
      </View>
      <ProviderCluster providers={summary.providers} />
      <Ionicons
        color={typeof muted === 'string' ? muted : undefined}
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={18}
        style={{ marginLeft: 10 }}
      />
    </PresstableScale>
  );
}

/** One episode log inside an expanded cluster — compact, rail-indented. */
function DiaryChildRow({
  entry,
  last,
  onOpen,
}: {
  entry: MergedDiaryEntry;
  last: boolean;
  onOpen: (id: string) => void;
}) {
  const detail = formatEpisodeDetail({
    type: entry.item.type,
    ...(entry.season != null ? { season: entry.season } : {}),
    episodes: entry.episodes,
  });

  return (
    // Fixed row height so the connector geometry is pixel-exact (labels are a
    // single line — numberOfLines={1} — so nothing needs to grow the row).
    <View className="flex-row px-6 h-11">
      {/* Terminal-style tree connector: a vertical trunk centered under the
          poster and a horizontal branch into the row — ├─ for a middle child,
          └─ for the last, whose trunk stops at the branch (mid-row) instead of
          running through. `left-6` is the 48px column's centre; `top-[22px]` is
          the 44px (h-11) row's middle. */}
      <View className="w-12 relative">
        <View
          className={`absolute left-6 top-0 w-px bg-border ${last ? 'h-[22px]' : 'bottom-0'}`}
        />
        <View className="absolute left-6 top-[22px] w-4 h-px bg-border" />
      </View>
      <PresstableScale
        className="flex-1 flex-row items-center"
        onPress={() => onOpen(entry.item.id)}
      >
        <Text
          className="flex-1 text-foreground font-sans text-sm"
          numberOfLines={1}
        >
          {detail !== '' ? detail : entry.item.title}
        </Text>
        <ProviderCluster providers={entry.providers} />
      </PresstableScale>
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

function DiaryFooter({ loading }: { loading: boolean }) {
  if (!loading) return <View className="h-24" />;
  return (
    <View className="py-6">
      <ActivityIndicator />
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
}

/**
 * The virtualized diary list (plan 0016 R7): day headers + collapsed rows,
 * infinite scroll via `onEndReached`, pull-to-refresh, the R10 failure banner
 * as a persistent list header, and a footer spinner while a page is in flight.
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
}: DiaryListProps) {
  const [refreshing, setRefreshing] = useState(false);
  // Which episode clusters are open. Expansion is ephemeral view state that
  // lives here in the list (not in a recycled row), keyed by the cluster's
  // stable anchor id — unlike day-minimize, which persists across restarts.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const collapsedDays = useCollapsedDiaryDays();
  const items = flattenDays(days, new Date(), timeZone, expanded, collapsedDays);

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

  return (
    <List
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => {
        switch (item.kind) {
          case 'header':
            return (
              <DiaryDayHeader
                collapsed={item.collapsed}
                count={item.count}
                label={item.label}
                onToggle={() => toggleDay(item.dayKey)}
              />
            );
          case 'cluster':
            return (
              <DiaryClusterRow
                cluster={item.cluster}
                expanded={item.expanded}
                onToggle={toggleCluster}
              />
            );
          case 'child':
            return (
              <DiaryChildRow entry={item.entry} last={item.last} onOpen={onOpen} />
            );
          default:
            return <DiaryRow entry={item.entry} onOpen={onOpen} />;
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
      onEndReached={hasNextPage ? onEndReached : undefined}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl onRefresh={refresh} refreshing={refreshing} />
      }
    />
  );
}
