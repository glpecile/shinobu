import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-screens/experimental';

import { DeferredTab } from '@/components/deferred-tab';
import Head from '@/components/head';
import { Keyboard, Text, type TextInputInstance, View } from 'react-native';

import { ActionableRow } from '@/components/actionable-row';
import { AnimatedView, GestureScrollView } from '@/components/animated-view';
import { CenteredNotice } from '@/components/centered-notice';
import { Eyebrow } from '@/components/eyebrow';
import { Fab } from '@/components/fab';
import { FeedRowSkeleton } from '@/components/feed-skeleton';
import { Image } from '@/components/image';
import { KeyboardAvoidingView } from '@/components/keyboard-avoiding-view';
import { List } from '@/components/List';
import { PickerSheet } from '@/components/picker-sheet';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon, type IconSourceId } from '@/components/provider-icon';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { SearchField } from '@/components/search-field';
import { SuspenseSection } from '@/components/suspense-section';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import {
  AnimeMoviesRow,
  SeasonalAnimeRow,
  TrendingMoviesRow,
  TrendingShowsRow,
} from '@/features/feed/feed-rows';
import { PosterWall } from '@/features/feed/poster-wall';
import { PersonAvatar } from '@/features/person/person-avatar';
import { onSearchFocusRequest } from '@/features/search/focus-signal';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { hasCoarsePointer } from '@/lib/pointer';
import { usePreloadRoute, usePushRoute } from '@/lib/navigation';
import { animeSeasonAt } from '@/lib/providers/anilist/season';
import { routes } from '@/lib/routes';
import { useThemeColor } from '@/lib/theme-color';
import {
  useAniListSearchQuery,
  useAniListStaffSearchQuery,
} from '@/state/queries/anilist';
import {
  useTmdbPersonSearchQuery,
  useTmdbSearchQuery,
  useTmdbStudioSearchQuery,
} from '@/state/queries/tmdb';
import {
  SEARCH_MIN_QUERY_LENGTH,
  useTraktSearchQuery,
} from '@/state/queries/trakt';
import { usePrefetchMediaDetails } from '@/state/queries/media-details';
import { getClientIdForProvider } from '@/state/session/provider-config';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedMediaItem } from '@/types/media';

const SEARCH_DEBOUNCE_MS = 300;

/** What the field searches for. Rides the URL as `?scope=`, like `?q=`. */
const SCOPES = [
  {
    value: 'titles',
    label: 'Titles',
    icon: 'film-outline',
    placeholder: 'Search titles',
  },
  {
    value: 'people',
    label: 'Cast & crew',
    icon: 'people-outline',
    placeholder: 'Search cast & crew',
  },
  {
    value: 'studios',
    label: 'Studios',
    icon: 'business-outline',
    placeholder: 'Search studios',
  },
] as const;

type SearchScope = (typeof SCOPES)[number]['value'];

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
  const preloadRoute = usePreloadRoute();
  return (
    <ActionableRow
      accessibility={{
        accessibilityLabel: `${item.title}, ${resultMeta(item)}`,
        accessibilityRole: 'button',
      }}
      className="px-6 py-2.5"
      href={routes.details(item.id, item.type)}
      item={item}
      leading={
        <>
          {item.coverImage !== '' ? (
            <Image
              source={{ uri: item.coverImage }}
              className="w-12 h-18 rounded bg-surface border border-border/50"
              contentFit="cover"
            />
          ) : (
            <View className="w-12 h-18 rounded bg-surface border border-border items-center justify-center">
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
      onPressIn={() => preloadRoute(routes.details(item.id, item.type))}
    />
  );
}

/** A person or studio hit: a face or a logo, a name, and a press to its page. */
function EntityResultRow({
  row,
  onPress,
}: {
  row: Extract<SearchRow, { kind: 'entity' }>;
  onPress: (href: string) => void;
}) {
  return (
    <PresstableOpacity
      accessibilityLabel={row.name}
      accessibilityRole="button"
      className="flex-row items-center px-6 py-2.5"
      onPress={() => onPress(row.href)}
    >
      {row.shape === 'face' ? (
        <PersonAvatar
          className="w-12 h-12"
          headshot={row.image}
          name={row.name}
          textClassName="text-sm"
        />
      ) : row.image !== '' ? (
        // Same treatment as the studio page's logo: contain, on a surface tile.
        <Image
          className="w-12 h-12 rounded bg-surface border border-border/50 p-1"
          contentFit="contain"
          source={{ uri: row.image }}
        />
      ) : (
        <PosterPlaceholder className="w-12 h-12 rounded" />
      )}
      <Text
        className="shrink ml-4 text-foreground font-sans-semibold text-base"
        numberOfLines={1}
      >
        {row.name}
      </Text>
    </PresstableOpacity>
  );
}

function RowSkeleton({ index = 0 }: { index?: number }) {
  const delay = staggerDelay(index);
  return (
    <View className="flex-row items-center px-6 py-2.5">
      <Skeleton className="w-12 h-18 rounded" delay={delay} />
      <View className="flex-1 ml-4">
        <Skeleton className="h-4 w-2/3 rounded" delay={delay} />
        <Skeleton className="h-3 w-24 rounded mt-2" delay={delay} />
      </View>
    </View>
  );
}

function ResultsSkeleton() {
  return (
    <View>
      {Array.from({ length: 6 }).map((_, index) => (
        <RowSkeleton index={index} key={index} />
      ))}
    </View>
  );
}

function SectionHeader({
  provider,
  label,
}: {
  provider: IconSourceId;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-2 px-6 pt-4 pb-1.5">
      <ProviderIcon id={provider} size={14} />
      <Eyebrow>{label}</Eyebrow>
    </View>
  );
}

/**
 * One flat virtualized list holds every provider section — headers and status
 * rows are list items too, so Legend List keeps virtualizing long result sets
 * instead of nesting per-section lists.
 */
type SearchRow =
  | { kind: 'header'; key: string; provider: IconSourceId; label: string }
  | { kind: 'result'; key: string; item: NormalizedMediaItem }
  | {
      kind: 'entity';
      key: string;
      name: string;
      image: string;
      shape: 'face' | 'logo';
      href: string;
    }
  | { kind: 'loading'; key: string }
  | { kind: 'error'; key: string };

interface SectionQueryState<Hit> {
  isLoading: boolean;
  isError: boolean;
  data?: Hit[] | undefined;
}

function titleRow(item: NormalizedMediaItem): SearchRow {
  return { kind: 'result', key: item.id, item };
}

function sectionRows<Hit>(
  provider: IconSourceId,
  label: string,
  search: SectionQueryState<Hit>,
  toRow: (hit: Hit) => SearchRow,
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
  return [header, ...items.map(toRow)];
}

export default function SearchTab() {
  return (
    <DeferredTab>
      <SearchScreen />
    </DeferredTab>
  );
}

function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pushRoute = usePushRoute();
  const prefetchDetails = usePrefetchMediaDetails();
  const params = useLocalSearchParams<{ q?: string; scope?: string }>();
  const initialQuery = typeof params.q === 'string' ? params.q : '';
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [scopeOpen, setScopeOpen] = useState(false);
  // Seeded from `?scope=`, like `input` from `?q=`: a tab tap wipes route
  // params (docs/solutions/native-tab-press-wipes-route-params.md).
  const [selectedScope, setSelectedScope] = useState(params.scope);
  const muted = useThemeColor('--color-muted');
  const inputRef = useRef<TextInputInstance>(null);
  // The same actions dialog the feed and diary open — quick log, details, and
  // the provider links, from a result row.
  const { openActions, sheetProps } = useCardActions();

  // The native "search" tab role only auto-focuses the field on iOS (its
  // dedicated search-tab UIKit affordance) — Android has no equivalent, so
  // tapping an already-active search tab did nothing. `onSearchFocusRequest`
  // fires on every tap of that tab (see app/(tabs)/_layout.tsx) — and on web
  // for every search tab press and ⌘K (see components/app-shell) — so this
  // opens the keyboard the same way on every platform.
  useLayoutEffect(() => {
    let handle: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onSearchFocusRequest(() => {
      const field = inputRef.current;
      if (field == null) return;
      // Android keeps the field *focused* after the keyboard is dismissed
      // (back gesture, scroll-away), so `.focus()` on an already-focused
      // input is a no-op and the keyboard never returns — blur first to force
      // a real focus transition. iOS's search-tab role handles its own
      // re-focus, so it's left alone.
      //
      // `Keyboard.isVisible()` is what keeps that blur scoped to the case it
      // exists for. Focused *with* the keyboard already up is the steady state
      // after any tap, so re-tapping the search tab used to blur (keyboard
      // slides out) and re-focus (slides back in) — the keyboard visibly
      // coming up twice on a double tap, with nothing gained (owner report
      // 2026-08-18). Nothing to do there: the field already has the focus this
      // request asks for.
      if (process.env.EXPO_OS === 'android' && field.isFocused()) {
        if (Keyboard.isVisible()) return;
        field.blur();
      }
      // The shell commits web navigation synchronously; the layout subscription
      // is ready before its gesture handler requests focus. Firefox can retain
      // DOM focus after dismissing the keyboard, so force a fresh transition.
      if (process.env.EXPO_OS === 'web') {
        if (field.isFocused()) field.blur();
        field.focus();
        return;
      }
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

  // Movies & TV comes from TMDB (builder token, no tracker needed) whenever
  // the token exists; Trakt text search fires only as the fallback when the
  // build has no TMDB token but *does* have an active Trakt client key (env
  // or BYO). Post-detachment most builds ship no Trakt key at all, and an
  // unauthenticated Trakt search is a guaranteed 4xx — the failure the old
  // always-Trakt section surfaced as a permanent error row.
  const tmdbAvailable = useTmdbToken() !== '';
  const moviesTvSource: IconSourceId | null = tmdbAvailable
    ? 'tmdb'
    : getClientIdForProvider('trakt') !== ''
      ? 'trakt'
      : null;
  // Studios exist on TMDB only, so without a token the scope isn't offered,
  // and a shared `?scope=studios` link falls back to titles.
  const scopes = SCOPES.filter(
    (entry) => entry.value !== 'studios' || tmdbAvailable,
  );
  const scope = scopes.find((entry) => entry.value === selectedScope) ?? SCOPES[0];

  const tmdbSearch = useTmdbSearchQuery({
    query,
    enabled: scope.value === 'titles' && moviesTvSource === 'tmdb',
  });
  const traktSearch = useTraktSearchQuery({
    query,
    enabled: scope.value === 'titles' && moviesTvSource === 'trakt',
  });
  const moviesTvSearch = moviesTvSource === 'tmdb' ? tmdbSearch : traktSearch;
  const anilistSearch = useAniListSearchQuery({
    query,
    enabled: scope.value === 'titles',
  });
  const personSearch = useTmdbPersonSearchQuery({
    query,
    enabled: scope.value === 'people' && tmdbAvailable,
  });
  const staffSearch = useAniListStaffSearchQuery({
    query,
    enabled: scope.value === 'people',
  });
  const studioSearch = useTmdbStudioSearchQuery({
    query,
    enabled: scope.value === 'studios',
  });

  const searchable = query.trim().length >= SEARCH_MIN_QUERY_LENGTH;
  const animeSeason = animeSeasonAt(new Date());
  const sections =
    scope.value === 'titles'
      ? [
          ...(moviesTvSource == null
            ? []
            : [
                {
                  search: moviesTvSearch,
                  rows: sectionRows(moviesTvSource, 'Movies & TV', moviesTvSearch, titleRow),
                },
              ]),
          {
            search: anilistSearch,
            rows: sectionRows('anilist', 'Anime & Manga', anilistSearch, titleRow),
          },
        ]
      : scope.value === 'people'
        ? [
            ...(tmdbAvailable
              ? [
                  {
                    search: personSearch,
                    rows: sectionRows('tmdb', 'Movies & TV', personSearch, (hit) => ({
                      kind: 'entity',
                      key: `tmdb-person-${hit.tmdbId}`,
                      name: hit.name,
                      image: hit.image,
                      shape: 'face',
                      href: routes.person(hit.tmdbId),
                    })),
                  },
                ]
              : []),
            {
              search: staffSearch,
              rows: sectionRows('anilist', 'Anime & Manga', staffSearch, (hit) => ({
                kind: 'entity',
                key: `anilist-staff-${hit.id}`,
                name: hit.name,
                image: hit.image ?? '',
                shape: 'face',
                href: routes.anilistPerson(hit.id),
              })),
            },
          ]
        : [
            {
              search: studioSearch,
              rows: sectionRows('tmdb', 'Studios', studioSearch, (hit) => ({
                kind: 'entity',
                key: `tmdb-studio-${hit.tmdbId}`,
                name: hit.name,
                image: hit.image,
                shape: 'logo',
                href: routes.studio(hit.tmdbId),
              })),
            },
          ];
  const rows = sections.flatMap((section) => section.rows);
  const fetching = searchable && sections.some((section) => section.search.isFetching);

  // The screen below the field is one of five mutually exclusive states.
  const state = !searchable
    ? 'idle'
    : sections.every((section) => section.search.isLoading)
      ? 'loading'
      : sections.every((section) => section.search.isError)
        ? 'error'
        : rows.length === 0
          ? 'empty'
          : 'results';

  function openDetails(item: NormalizedMediaItem) {
    prefetchDetails(item);
    pushRoute(routes.details(item.id, item.type));
  }

  // Resets all three representations of the query at once. Leaving `query`
  // behind would keep the stale results mounted until the debounce catches up
  // (and re-push the old `?q=`), so the button clears input, debounced query,
  // and route param together. SearchField restores focus for the next search.
  function clearSearch() {
    setInput('');
    setQuery('');
    router.setParams({ q: undefined });
  }

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Search — Shinobu</title>
      </Head>
      <View
        className="relative z-20 flex-row items-center px-2 pb-2 web:px-4"
        style={{ paddingTop: insets.top + 8 }}
      >
        <SearchField
          accessibilityLabel={`Search ${scope.label.toLowerCase()}`}
          // Android's tab-focus request owns the keyboard; autofocus races it.
          autoFocus={process.env.EXPO_OS !== 'android' && !hasCoarsePointer()}
          className="flex-1"
          loading={fetching}
          onChangeText={setInput}
          onClear={clearSearch}
          placeholder={scope.placeholder}
          ref={inputRef}
          value={input}
        />
      </View>

      {/* Inset before keyboard avoidance so the tab bar and keyboard overlap
          aren't added together. Android's tab host already insets content. */}
      <SafeAreaView edges={{ bottom: process.env.EXPO_OS === 'ios' }} style={{ flex: 1 }}>
        <KeyboardAvoidingView automaticOffset behavior="padding" className="flex-1">
          {/* The Fab anchors to this frame: an absolute child of the padded view
              sits on its padding box, under the keyboard. */}
          <View className="flex-1">
            {/* No entrance between states: typing drives them many times a
                day, so each one cuts. */}
            <View className="flex-1">
              {state === 'idle' ? (
                scope.value === 'titles' ? (
                  <GestureScrollView
                    className="flex-1"
                    contentContainerClassName="pb-28"
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                  >
                    <SuspenseSection fallback={<FeedRowSkeleton hasAction />}>
                      <SeasonalAnimeRow onItemActions={openActions} season={animeSeason} />
                    </SuspenseSection>
                    <SuspenseSection fallback={<FeedRowSkeleton hasAction />}>
                      <AnimeMoviesRow onItemActions={openActions} season={animeSeason} />
                    </SuspenseSection>
                    <SuspenseSection fallback={<FeedRowSkeleton />}>
                      <TrendingMoviesRow onItemActions={openActions} />
                    </SuspenseSection>
                    <SuspenseSection fallback={<FeedRowSkeleton />}>
                      <TrendingShowsRow onItemActions={openActions} />
                    </SuspenseSection>
                  </GestureScrollView>
                ) : (
                  <View className="flex-1">
                    <PosterWall key={scope.value} subject={scope.value} />
                    {/* Where the wall's fade turns solid, as on Home: low on
                        phones (clear of the Fab), left on wide screens. */}
                    <View className="flex-1 justify-end md:justify-center px-6 pb-24 md:px-16 md:pb-16">
                      <Text className="text-5xl text-muted mb-4">忍</Text>
                      <Text className="text-2xl font-display text-foreground">Search</Text>
                      <Text className="text-base font-sans text-muted mt-3 max-w-sm leading-relaxed">
                        Find any movie, show, anime, or manga — open its details or log it to your trackers. The button in the corner switches to
                        {tmdbAvailable ? ' cast & crew or studios.' : ' cast & crew.'}
                      </Text>
                    </View>
                  </View>
                )
              ) : state === 'loading' ? (
                <ResultsSkeleton />
              ) : state === 'error' ? (
                <CenteredNotice className="-mt-16">
                  <CenteredNotice.Title>Something went wrong</CenteredNotice.Title>
                  <CenteredNotice.Body>
                    Search failed. Check your connection and try again.
                  </CenteredNotice.Body>
                </CenteredNotice>
              ) : state === 'empty' ? (
                <CenteredNotice className="-mt-16">
                  <CenteredNotice.Icon name="search-outline" />
                  <CenteredNotice.Title>No results</CenteredNotice.Title>
                  <CenteredNotice.Body>Nothing matched “{query.trim()}”.</CenteredNotice.Body>
                </CenteredNotice>
              ) : (
                // While a newer query is in flight the previous results stay visible
                // (keepPreviousData), dimmed so the staleness is legible — and the
                // dim crossfades, since it changes twice per search.
                <AnimatedView
                  className="flex-1"
                  style={{
                    opacity: sections.some(
                      (section) => section.search.isPlaceholderData,
                    )
                      ? 0.6
                      : 1,
                    transitionProperty: 'opacity',
                    transitionDuration: DURATION.swap,
                    transitionTimingFunction: EASE_OUT,
                  }}
                >
                  <List
                    // Clear the native bottom tab bar (unmeasurable height) so the last
                    // result isn't hidden behind it; web has no tab bar.
                    contentContainerStyle={
                      process.env.EXPO_OS === 'web' ? undefined : { paddingBottom: 96 }
                    }
                    data={rows}
                    estimatedItemSize={92}
                    getItemType={(row) => row.kind}
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
                      ) : row.kind === 'entity' ? (
                        <EntityResultRow onPress={pushRoute} row={row} />
                      ) : row.kind === 'loading' ? (
                        <RowSkeleton />
                      ) : (
                        <Text className="text-muted font-sans text-sm px-6 py-3">
                          Search failed for this source — try again in a moment.
                        </Text>
                      )
                    }
                  />
                </AnimatedView>
              )}
            </View>
            <Fab
              className="absolute bottom-5 right-6"
              hint="Chooses what to search for"
              icon={scope.icon}
              label={`Searching ${scope.label}`}
              onPress={() => {
                // The picker sheet would otherwise open behind the keyboard.
                Keyboard.dismiss();
                setScopeOpen(true);
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <PickerSheet
        onClose={() => setScopeOpen(false)}
        onSelect={(next: SearchScope) => {
          setSelectedScope(next);
          router.setParams({ scope: next === 'titles' ? undefined : next });
        }}
        open={scopeOpen}
        title="Search for"
        value={scope.value}
      >
        {scopes.map((entry) => (
          <PickerSheet.Option
            icon={<Ionicons color={muted} name={entry.icon} size={20} />}
            key={entry.value}
            label={entry.label}
            value={entry.value}
          />
        ))}
      </PickerSheet>
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
