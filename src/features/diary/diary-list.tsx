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
import { useTraktMediaImages } from '@/state/queries/trakt';
import type { DiaryDay, MergedDiaryEntry } from '@/types/media';

import { formatDayHeader, formatEpisodeDetail } from './merge';

/** Flattened list rows: a sticky-ish day header, then that day's entries. */
type DiaryListItem =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'entry'; key: string; entry: MergedDiaryEntry };

function flattenDays(
  days: DiaryDay[],
  now: Date,
  timeZone: string,
): DiaryListItem[] {
  const items: DiaryListItem[] = [];
  for (const day of days) {
    items.push({
      kind: 'header',
      key: `h-${day.key}`,
      label: formatDayHeader(day.key, now, timeZone),
    });
    for (const entry of day.entries) {
      items.push({ kind: 'entry', key: entry.id, entry });
    }
  }
  return items;
}

function DiaryDayHeader({ label }: { label: string }) {
  return (
    <View className="px-6 pt-5 pb-1.5">
      <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider">
        {label}
      </Text>
    </View>
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

function DiaryRow({
  entry,
  onOpen,
}: {
  entry: MergedDiaryEntry;
  onOpen: (id: string) => void;
}) {
  // Trakt history rows arrive artless (2026 API dropped images from sync
  // endpoints) — recover the poster lazily per rendered row, like the cards.
  const { coverImage } = useTraktMediaImages(entry.item);
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
      {coverImage !== '' ? (
        <Image
          source={{ uri: coverImage }}
          className="w-12 h-[72px] rounded bg-surface border border-border/50"
          contentFit="cover"
          recyclingKey={entry.item.id}
        />
      ) : (
        <PosterPlaceholder className="w-12 h-[72px] rounded" />
      )}
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
  const items = flattenDays(days, new Date(), timeZone);

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
      renderItem={({ item }) =>
        item.kind === 'header' ? (
          <DiaryDayHeader label={item.label} />
        ) : (
          <DiaryRow entry={item.entry} onOpen={onOpen} />
        )
      }
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
