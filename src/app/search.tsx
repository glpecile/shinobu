import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import Head from '@/components/head';
import { Text, TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Image } from '@/components/image';
import { List } from '@/components/List';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { SearchBackButton } from '@/components/search-back-button';
import { Skeleton } from '@/components/skeleton';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { useAniListSearchQuery } from '@/state/queries/anilist';
import {
  SEARCH_MIN_QUERY_LENGTH,
  useTraktSearchQuery,
} from '@/state/queries/trakt';
import type { NormalizedMediaItem } from '@/types/media';

const SEARCH_DEBOUNCE_MS = 300;

function resultMeta(item: NormalizedMediaItem): string {
  return [item.type, item.year != null ? String(item.year) : null]
    .filter((part) => part != null)
    .join(' · ');
}

function SearchResultRow({
  item,
  onPress,
}: {
  item: NormalizedMediaItem;
  onPress: (item: NormalizedMediaItem) => void;
}) {
  return (
    <PresstableOpacity
      className="flex-row items-center px-6 py-2.5"
      onPress={() => onPress(item)}
    >
      {item.coverImage !== '' ? (
        <Image
          source={{ uri: item.coverImage }}
          className="w-12 h-[72px] rounded bg-surface border border-border/50"
          contentFit="cover"
        />
      ) : (
        <View className="w-12 h-[72px] rounded bg-surface border border-border items-center justify-center">
          <Text className="text-muted font-display text-lg">忍</Text>
        </View>
      )}
      <View className="flex-1 ml-4">
        <Text
          className="text-foreground font-sans-semibold text-base"
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <Text className="text-muted font-sans text-xs mt-1 uppercase tracking-wider">
          {resultMeta(item)}
        </Text>
      </View>
    </PresstableOpacity>
  );
}

function RowSkeleton() {
  return (
    <View className="flex-row items-center px-6 py-2.5">
      <Skeleton className="w-12 h-[72px] rounded" />
      <View className="flex-1 ml-4">
        <Skeleton className="h-4 w-2/3 rounded" />
        <Skeleton className="h-3 w-24 rounded mt-2" />
      </View>
    </View>
  );
}

function ResultsSkeleton() {
  return (
    <View>
      {Array.from({ length: 6 }).map((_, index) => (
        <RowSkeleton key={index} />
      ))}
    </View>
  );
}

function SectionHeader({
  provider,
  label,
}: {
  provider: ProviderId;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-2 px-6 pt-4 pb-1.5">
      <ProviderIcon id={provider} size={14} />
      <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider">
        {label}
      </Text>
    </View>
  );
}

function CenteredHint({ title, body }: { title: string; body: string }) {
  return (
    <View className="flex-1 items-center justify-center px-8 -mt-16">
      <Text className="text-2xl font-display text-foreground text-center">
        {title}
      </Text>
      <Text className="text-base font-sans text-muted mt-3 text-center max-w-xs leading-relaxed">
        {body}
      </Text>
    </View>
  );
}

/**
 * One flat virtualized list holds both provider sections — headers and status
 * rows are list items too, so Legend List keeps virtualizing long result sets
 * instead of nesting per-section lists.
 */
type SearchRow =
  | { kind: 'header'; key: string; provider: ProviderId; label: string }
  | { kind: 'result'; key: string; item: NormalizedMediaItem }
  | { kind: 'loading'; key: string }
  | { kind: 'error'; key: string };

interface SectionQueryState {
  isLoading: boolean;
  isError: boolean;
  data?: NormalizedMediaItem[] | undefined;
}

function sectionRows(
  provider: ProviderId,
  label: string,
  search: SectionQueryState,
): SearchRow[] {
  const header: SearchRow = {
    kind: 'header',
    key: `${provider}-header`,
    provider,
    label,
  };
  if (search.isLoading) {
    return [header, { kind: 'loading', key: `${provider}-loading` }];
  }
  if (search.isError) {
    return [header, { kind: 'error', key: `${provider}-error` }];
  }
  const items = search.data ?? [];
  // A section with nothing to say disappears — the other one keeps the screen.
  if (items.length === 0) return [];
  return [
    header,
    ...items.map(
      (item): SearchRow => ({ kind: 'result', key: item.id, item }),
    ),
  ];
}

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const initialQuery = typeof params.q === 'string' ? params.q : '';
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const muted = useCSSVariable('--color-muted');

  // A real debounce (not useDeferredValue, which settles per keystroke and
  // fired a request for every character): the query — and the shareable
  // ?q= URL param — trail the input by one quiet interval.
  useEffect(() => {
    if (input === query) return undefined;
    const handle = setTimeout(() => {
      setQuery(input);
      router.setParams({ q: input.trim() === '' ? undefined : input });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [input, query, router]);

  const traktSearch = useTraktSearchQuery({ query });
  const anilistSearch = useAniListSearchQuery({ query });

  const searchable = query.trim().length >= SEARCH_MIN_QUERY_LENGTH;
  const rows = [
    ...sectionRows('trakt', 'Movies & TV', traktSearch),
    ...sectionRows('anilist', 'Anime & Manga', anilistSearch),
  ];

  function goBack() {
    if (process.env.EXPO_OS === 'web') {
      router.replace(routes.home);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.home);
    }
  }

  function openDetails(item: NormalizedMediaItem) {
    router.push(routes.details(item.id));
  }

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Search — Shinobu</title>
      </Head>
      <View
        className={`relative z-20 flex-row items-center gap-3 px-6 ${screenHeaderTopPadding} pb-4`}
      >
        <SearchBackButton onPress={goBack} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          className="flex-1 border border-border bg-surface text-foreground px-4 py-3 rounded font-sans"
          onChangeText={setInput}
          placeholder="Search movies, shows, anime & manga"
          placeholderTextColor={typeof muted === 'string' ? muted : undefined}
          returnKeyType="search"
          value={input}
        />
      </View>

      {!searchable ? (
        <CenteredHint
          body="Find any movie, show, anime, or manga — open its details or log it to your trackers."
          title="Search"
        />
      ) : traktSearch.isLoading && anilistSearch.isLoading ? (
        <ResultsSkeleton />
      ) : traktSearch.isError && anilistSearch.isError ? (
        <CenteredHint
          body="Search failed. Check your connection and try again."
          title="Something went wrong"
        />
      ) : rows.length === 0 ? (
        <CenteredHint
          body={`Nothing matched “${query.trim()}”.`}
          title="No results"
        />
      ) : (
        // While a newer query is in flight the previous results stay visible
        // (keepPreviousData), dimmed so the staleness is legible.
        <View
          className={
            traktSearch.isPlaceholderData || anilistSearch.isPlaceholderData
              ? 'flex-1 opacity-60'
              : 'flex-1'
          }
        >
          <List
            data={rows}
            keyExtractor={(row) => row.key}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: row }) =>
              row.kind === 'header' ? (
                <SectionHeader label={row.label} provider={row.provider} />
              ) : row.kind === 'result' ? (
                <SearchResultRow item={row.item} onPress={openDetails} />
              ) : row.kind === 'loading' ? (
                <RowSkeleton />
              ) : (
                <Text className="text-muted font-sans text-sm px-6 py-3">
                  Search failed for this source — try again in a moment.
                </Text>
              )
            }
          />
        </View>
      )}
    </View>
  );
}
