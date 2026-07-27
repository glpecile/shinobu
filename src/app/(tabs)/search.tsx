import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import Head from '@/components/head';
import { Text, TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ActionableRow } from '@/components/actionable-row';
import { Image } from '@/components/image';
import { List } from '@/components/List';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { Skeleton } from '@/components/skeleton';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import { onSearchFocusRequest } from '@/features/search/focus-signal';
import { cn } from '@/lib/cn';
import { hasCoarsePointer } from '@/lib/pointer';
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

/**
 * A result row carries the same actions as a feed card (plan 0028 R2): press
 * opens details, long-press (web: the hover ⋯) opens the actions dialog, so a
 * title you searched for can be logged without a round trip through its details
 * page. `ActionableRow` is the shared shell the diary already uses.
 */
function SearchResultRow({
  item,
  onPress,
  onActions,
}: {
  item: NormalizedMediaItem;
  onPress: (item: NormalizedMediaItem) => void;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  return (
    <ActionableRow
      accessibility={{
        accessibilityLabel: `${item.title}, ${resultMeta(item)}`,
        accessibilityRole: 'button',
      }}
      className="px-6 py-2.5"
      href={routes.details(item.id)}
      item={item}
      leading={
        <>
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
          <View className="shrink ml-4">
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
        </>
      }
      onActions={onActions}
      onPress={() => onPress(item)}
    />
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
  const [focused, setFocused] = useState(false);
  const muted = useCSSVariable('--color-muted');
  const inputRef = useRef<TextInput>(null);
  // The same actions dialog the feed and diary open — quick log, details, and
  // the provider links, from a result row.
  const { openActions, sheetProps } = useCardActions();

  // The native "search" tab role only auto-focuses the field on iOS (its
  // dedicated search-tab UIKit affordance) — Android has no equivalent, so
  // tapping an already-active search tab did nothing. `onSearchFocusRequest`
  // fires on every tap of that tab (see app/(tabs)/_layout.tsx) — and on web's
  // ⌘K while search is already open — so this opens the keyboard the same way
  // on every platform.
  useEffect(() => {
    let handle: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onSearchFocusRequest(() => {
      const field = inputRef.current;
      if (field == null) return;
      // Android keeps the field *focused* after the keyboard is dismissed
      // (back gesture, scroll-away), so `.focus()` on an already-focused
      // input is a no-op and the keyboard never returns — blur first to force
      // a real focus transition. iOS's search-tab role handles its own
      // re-focus, so it's left alone.
      if (process.env.EXPO_OS === 'android' && field.isFocused()) field.blur();
      // Deferred past the tab-press frame: focusing synchronously inside the
      // native tab transition gets swallowed (and the blur above needs a tick
      // to land before the re-focus counts as a transition).
      clearTimeout(handle);
      handle = setTimeout(() => inputRef.current?.focus(), 50);
    });
    return () => {
      unsubscribe();
      clearTimeout(handle);
    };
  }, []);

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

  function openDetails(item: NormalizedMediaItem) {
    router.push(routes.details(item.id));
  }

  // Resets all three representations of the query at once. Leaving `query`
  // behind would keep the stale results mounted until the debounce catches up
  // (and re-push the old `?q=`), so the button clears input, debounced query,
  // and route param together, then hands focus back for the next search.
  function clearSearch() {
    setInput('');
    setQuery('');
    router.setParams({ q: undefined });
    inputRef.current?.focus();
  }

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Search — Shinobu</title>
      </Head>
      <View
        className={cn(
          'relative z-20 flex-row items-center gap-3 px-6',
          screenHeaderTopPadding,
          'pb-4',
        )}
      >
        {/* The field's chrome lives on this row, not on the TextInput, so the
            clear button can sit *beside* the input instead of on top of it.
            An absolutely-positioned pressable overlapping the input looked
            identical but never fired on Android — the EditText claims the
            touch first (docs/solutions/android-pressable-over-textinput.md). */}
        <View
          className={
            focused
              ? 'flex-1 flex-row items-center border bg-surface rounded-md border-accent'
              : 'flex-1 flex-row items-center border bg-surface rounded-md border-border'
          }
        >
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            // First mount only — every later focus request (tab re-press,
            // ⌘K, the clear button) goes through the handlers above rather
            // than through a re-mount. Off on touch browsers: they refuse to
            // open the keyboard for a focus with no user gesture behind it,
            // and Firefox Android answers with a flash-open-then-close that
            // makes the field unusable (src/lib/pointer.ts).
            autoFocus={!hasCoarsePointer()}
            // `outline-none`: the browser's focus ring would now draw around
            // the inner input, inside the wrapper that carries the field's
            // border — the accent border below is the focus affordance instead,
            // and it works on native too.
            className="flex-1 text-foreground px-4 py-3 font-sans outline-none"
            onBlur={() => setFocused(false)}
            onChangeText={setInput}
            onFocus={() => setFocused(true)}
            placeholder="Search movies, shows, anime & manga"
            placeholderTextColor={typeof muted === 'string' ? muted : undefined}
            ref={inputRef}
            returnKeyType="search"
            value={input}
          />
          {input !== '' && (
            <PresstableOpacity
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              // The pressable is the 44pt touch target; the *drawn* chip inside
              // is smaller. `close-circle` (one solid 20px glyph) painted a
              // light-grey blob the size of the text next to it — heaviest
              // thing in the header, and on Firefox Android the font's circle
              // rasterised with a ragged edge on top of that. A hairline chip
              // around a thin `close` stroke reads as field chrome instead, and
              // its circle is drawn by the layout engine rather than the icon
              // font, so no browser gets a say in how round it is.
              className="w-11 h-11 items-center justify-center"
              onPress={clearSearch}
            >
              <View className="w-6 h-6 items-center justify-center rounded-full bg-border">
                <Ionicons
                  color={typeof muted === 'string' ? muted : undefined}
                  name="close"
                  size={14}
                />
              </View>
            </PresstableOpacity>
          )}
        </View>
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
            // Clear the native bottom tab bar (unmeasurable height) so the last
            // result isn't hidden behind it; web has no tab bar.
            contentContainerStyle={
              process.env.EXPO_OS === 'web' ? undefined : { paddingBottom: 96 }
            }
            data={rows}
            keyExtractor={(row) => row.key}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: row }) =>
              row.kind === 'header' ? (
                <SectionHeader label={row.label} provider={row.provider} />
              ) : row.kind === 'result' ? (
                <SearchResultRow
                  item={row.item}
                  onActions={openActions}
                  onPress={openDetails}
                />
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
      {/* `canHide={false}`: a search result is not a feed entry, and hiding one
          would quietly suppress it everywhere. `providerLinks="connected"`
          because a result's source provider is an accident of which search
          answered — what the user wants is the tracker they actually use. */}
      <CardActionsSheet
        {...sheetProps}
        canHide={false}
        providerLinks="connected"
      />
    </View>
  );
}
