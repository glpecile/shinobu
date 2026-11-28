import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-screens/experimental';

import { DeferredTab } from '@/components/deferred-tab';
import Head from '@/components/head';
import {
  Keyboard,
  type ScrollViewInstance,
  Text,
  type TextInputInstance,
  View,
} from 'react-native';

import { ActionableRow } from '@/components/actionable-row';
import { AnimatedView } from '@/components/animated-view';
import { CollapsibleSection } from '@/components/collapsible-section';
import { CenteredNotice } from '@/components/centered-notice';
import { Eyebrow } from '@/components/eyebrow';
import { Fab } from '@/components/fab';
import { Image } from '@/components/image';
import { KeyboardAvoidingView } from '@/components/keyboard-avoiding-view';
import { List } from '@/components/List';
import { PickerSheet } from '@/components/picker-sheet';
import { PosterPlaceholder } from '@/components/poster-placeholder';
import { PresstableScale } from '@/components/presstable';
import { ProviderIcon, type IconSourceId } from '@/components/provider-icon';
import { Button } from '@/components/button';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { SearchField } from '@/components/search-field';
import { SmallPoster } from '@/components/small-poster';
import { SuspenseSection } from '@/components/suspense-section';
import { CardActionsSheet } from '@/features/card-actions/card-actions-sheet';
import { useCardActions } from '@/features/card-actions/use-card-actions';
import {
  AnimeMoviesRow,
  FeedEnd,
  SeasonalAnimeRow,
  TrendingMoviesRow,
  TrendingShowsRow,
} from '@/features/feed/feed-rows';
import { PosterWall } from '@/features/feed/poster-wall';
import { mediaKindLabel } from '@/features/media-layout/watchlist-rows';
import { PersonAvatar } from '@/features/person/person-avatar';
import { onSearchFocusRequest } from '@/features/search/focus-signal';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { dismissKeyboardNow } from '@/lib/keyboard';
import { hasCoarsePointer } from '@/lib/pointer';
import { usePushRoute } from '@/lib/navigation';
import { animeSeasonAt } from '@/lib/providers/anilist/season';
import { Provider } from '@/lib/providers/types';
import { cn } from '@/lib/cn';
import { routes } from '@/lib/routes';
import { useThemeColor } from '@/lib/theme-color';
import { useAniListSearchQuery, useAniListStaffSearchQuery } from '@/state/queries/anilist';
import { useHardcoverBookSearchQuery } from '@/state/queries/hardcover';
import {
  useTmdbPersonSearchQuery,
  useTmdbSearchQuery,
  useTmdbStudioSearchQuery,
} from '@/state/queries/tmdb';
import { SEARCH_MIN_QUERY_LENGTH, useTraktSearchQuery } from '@/state/queries/trakt';
import { usePrefetchMediaDetails } from '@/state/queries/media-details';
import { useConnectedProviders } from '@/state/session';
import { getClientIdForProvider } from '@/state/session/provider-config';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedMediaItem } from '@/types/media';

const SEARCH_DEBOUNCE_MS = 300;

const SCOPES = [
  {
    value: 'titles',
    label: 'Movies & TV',
    icon: 'film-outline',
    placeholder: 'Search movies & TV',
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
  {
    value: 'reading',
    label: 'Reading',
    icon: 'library-outline',
    placeholder: 'Search manga & light novels',
  },
] as const;

type SearchScope = (typeof SCOPES)[number]['value'];

/** The idle line for a scope without discovery rows. */
function scopeWelcome(scope: Exclude<SearchScope, 'titles'>, readingLabel: string): string {
  switch (scope) {
    case 'people':
      return 'Find an actor, director, or voice actor and open their credits.';
    case 'studios':
      return 'Find a studio and open everything it made.';
    case 'reading':
      return `Find ${readingLabel} and log what you read.`;
  }
}

function resultMeta(item: NormalizedMediaItem): string {
  return [mediaKindLabel(item), item.year != null ? String(item.year) : null]
    .filter((part) => part != null)
    .join(' · ');
}

function SearchResultRow({
  item,
  byline,
  onPress,
  onActions,
}: {
  item: NormalizedMediaItem;
  byline?: string;
  onPress: (item: NormalizedMediaItem) => void;
  onActions: (item: NormalizedMediaItem) => void;
}) {
  return (
    <ActionableRow
      accessibility={{
        accessibilityLabel: [item.title, byline, resultMeta(item)]
          .filter((part) => part != null && part !== '')
          .join(', '),
        accessibilityRole: 'button',
      }}
      className="px-6 py-2.5"
      href={routes.details(item.id, item.type)}
      item={item}
      leading={
        <>
          <SmallPoster recyclingKey={item.id} size="md" uri={item.coverImage} />
          <View className="shrink ml-4">
            <Text className="text-foreground font-sans-semibold text-base" numberOfLines={1}>
              {item.title}
            </Text>
            {byline != null && byline !== '' && (
              <Text className="text-muted font-sans text-sm mt-0.5" numberOfLines={1}>
                {byline}
              </Text>
            )}
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

function EntityResultRow({
  row,
  onPress,
}: {
  row: Extract<SearchRow, { kind: 'entity' }>;
  onPress: (href: string) => void;
}) {
  return (
    <PresstableScale
      accessibilityLabel={row.name}
      accessibilityRole="button"
      className="flex-row items-center px-6 py-2.5"
      minScale={0.99}
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
        <Image
          className="w-12 h-12 rounded bg-logo-tile p-1"
          contentFit="contain"
          source={{ uri: row.image }}
        />
      ) : (
        <PosterPlaceholder className="w-12 h-12 rounded" />
      )}
      <Text className="shrink ml-4 text-foreground font-sans-semibold text-base" numberOfLines={1}>
        {row.name}
      </Text>
    </PresstableScale>
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

function EntityRowSkeleton({ index = 0, shape }: { index?: number; shape: 'face' | 'logo' }) {
  const delay = staggerDelay(index);
  return (
    <View className="flex-row items-center px-6 py-2.5">
      <Skeleton
        className={cn('size-12', shape === 'face' ? 'rounded-full' : 'rounded')}
        delay={delay}
      />
      <Skeleton className="h-4 w-1/2 ml-4 rounded" delay={delay} />
    </View>
  );
}

function ResultRowSkeleton({ index, scope }: { index?: number; scope: SearchScope }) {
  switch (scope) {
    case 'titles':
    case 'reading':
      return <RowSkeleton index={index} />;
    case 'people':
      return <EntityRowSkeleton index={index} shape="face" />;
    case 'studios':
      return <EntityRowSkeleton index={index} shape="logo" />;
  }
}

function ResultsSkeleton({ scope }: { scope: SearchScope }) {
  return (
    <View>
      <View className="flex-row items-center gap-2 px-6 pt-4 pb-1.5">
        <Skeleton className="size-3.5 rounded-full" />
        <Skeleton className="h-4 w-20 rounded" />
      </View>
      {Array.from({ length: 6 }).map((_, index) => (
        <ResultRowSkeleton index={index} key={index} scope={scope} />
      ))}
    </View>
  );
}

function SectionHeader({ provider, label }: { provider: IconSourceId; label: string }) {
  return (
    <View className="flex-row items-center gap-2 px-6 pt-4 pb-1.5">
      <ProviderIcon id={provider} size={14} />
      <Eyebrow>{label}</Eyebrow>
    </View>
  );
}

type SearchRow =
  | { kind: 'header'; key: string; provider: IconSourceId; label: string }
  | { kind: 'result'; key: string; item: NormalizedMediaItem; byline?: string }
  | {
      kind: 'entity';
      key: string;
      name: string;
      image: string;
      shape: 'face' | 'logo';
      href: string;
    }
  | { kind: 'loading'; key: string }
  | { kind: 'error'; key: string; retrying: boolean; onRetry: () => void };

interface SectionQueryState<Hit> {
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
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
    return [
      header,
      {
        kind: 'error',
        key: `${provider}-error`,
        retrying: search.isFetching,
        onRetry: () => {
          void search.refetch();
        },
      },
    ];
  }
  const items = search.data ?? [];
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
  const scrollRef = useRef<ScrollViewInstance>(null);
  const reduceMotion = useReducedMotion();
  const { openActions, sheetProps } = useCardActions();

  // Only iOS's search tab role auto-focuses the field; Android and web need explicit focus requests.
  useLayoutEffect(() => {
    let handle: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onSearchFocusRequest(() => {
      const field = inputRef.current;
      if (field == null) return;
      // Android keeps TextInput focused after keyboard dismiss, so .focus() is a no-op unless blurred first; skip when keyboard is already visible.
      if (process.env.EXPO_OS === 'android' && field.isFocused()) {
        if (Keyboard.isVisible()) return;
        field.blur();
      }
      // Firefox can retain DOM focus after dismissing the keyboard, so blur before focusing.
      if (process.env.EXPO_OS === 'web') {
        if (field.isFocused()) field.blur();
        field.focus();
        return;
      }
      // Defer past the native tab transition frame (and the Android blur) or focus gets swallowed.
      clearTimeout(handle);
      handle = setTimeout(() => inputRef.current?.focus(), 50);
    });
    return () => {
      unsubscribe();
      clearTimeout(handle);
    };
  }, []);

  useEffect(() => {
    if (input === query) return undefined;
    const handle = setTimeout(() => {
      setQuery(input);
      router.setParams({ q: input.trim() === '' ? undefined : input });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [input, query, router]);

  const tmdbAvailable = useTmdbToken() !== '';
  const moviesTvSource: IconSourceId | null = tmdbAvailable
    ? 'tmdb'
    : getClientIdForProvider(Provider.Trakt) !== ''
      ? Provider.Trakt
      : null;
  const scopes = SCOPES.filter((entry) => entry.value !== 'studios' || tmdbAvailable);
  const scope = scopes.find((entry) => entry.value === selectedScope) ?? SCOPES[0];
  const reading = scope.value === 'reading';
  const titleSearch = scope.value === 'titles' || reading;

  const tmdbSearch = useTmdbSearchQuery({
    query,
    enabled: scope.value === 'titles' && moviesTvSource === 'tmdb',
  });
  const traktSearch = useTraktSearchQuery({
    query,
    enabled: scope.value === 'titles' && moviesTvSource === Provider.Trakt,
  });
  const moviesTvSearch = moviesTvSource === 'tmdb' ? tmdbSearch : traktSearch;
  const anilistSearch = useAniListSearchQuery({
    query,
    type: reading ? 'MANGA' : 'ANIME',
    enabled: titleSearch,
  });
  const personSearch = useTmdbPersonSearchQuery({
    query,
    enabled: scope.value === 'people' && tmdbAvailable,
  });
  const staffSearch = useAniListStaffSearchQuery({
    query,
    enabled: scope.value === 'people',
  });
  const booksSearchable = useConnectedProviders().includes(Provider.Hardcover);
  const bookSearch = useHardcoverBookSearchQuery({
    query,
    enabled: reading && booksSearchable,
  });
  const studioSearch = useTmdbStudioSearchQuery({
    query,
    enabled: scope.value === 'studios',
  });

  const readingLabel = booksSearchable ? 'manga, light novels & books' : 'manga & light novels';
  const placeholder = reading ? `Search ${readingLabel}` : scope.placeholder;
  const searchable = query.trim().length >= SEARCH_MIN_QUERY_LENGTH;
  const animeSeason = animeSeasonAt(new Date());
  const sections = titleSearch
    ? [
        ...(reading || moviesTvSource == null
          ? []
          : [
              {
                search: moviesTvSearch,
                rows: sectionRows(moviesTvSource, 'Movies & TV', moviesTvSearch, titleRow),
              },
            ]),
        {
          search: anilistSearch,
          rows: sectionRows(
            Provider.AniList,
            reading ? 'Manga & light novels' : 'Anime',
            anilistSearch,
            titleRow,
          ),
        },
        ...(reading && booksSearchable
          ? [
              {
                search: bookSearch,
                rows: sectionRows(Provider.Hardcover, 'Books', bookSearch, (hit): SearchRow => ({
                  kind: 'result',
                  key: hit.item.id,
                  item: hit.item,
                  byline: hit.authors.slice(0, 2).join(', '),
                })),
              },
            ]
          : []),
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
            rows: sectionRows(Provider.AniList, 'Anime & Manga', staffSearch, (hit) => ({
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

  const state = !searchable
    ? 'idle'
    : sections.every((section) => section.search.isLoading)
      ? 'loading'
      : sections.every((section) => section.search.isError)
        ? 'error'
        : rows.length === 0
          ? 'empty'
          : 'results';

  function retryFailed() {
    for (const section of sections) {
      if (section.search.isError) void section.search.refetch();
    }
  }

  function setScope(next: SearchScope) {
    setSelectedScope(next);
    router.setParams({ scope: next === 'titles' ? undefined : next });
  }

  function openDetails(item: NormalizedMediaItem) {
    prefetchDetails(item);
    pushRoute(routes.details(item.id, item.type));
  }

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
          accessibilityLabel={placeholder}
          // Android's tab-focus request owns the keyboard; autofocus races it.
          autoFocus={process.env.EXPO_OS !== 'android' && !hasCoarsePointer()}
          className="flex-1"
          loading={fetching}
          onChangeText={setInput}
          onClear={clearSearch}
          placeholder={placeholder}
          ref={inputRef}
          value={input}
        />
      </View>

      {/* Inset before KeyboardAvoidingView so tab bar and keyboard insets don't stack; Android's tab host already insets. */}
      <SafeAreaView edges={{ bottom: process.env.EXPO_OS === 'ios' }} style={{ flex: 1 }}>
        <KeyboardAvoidingView automaticOffset behavior="padding" className="flex-1">
          {/* The Fab anchors to this frame: an absolute child of the padded view
              sits on its padding box, under the keyboard. */}
          <View className="flex-1">
            <View className="flex-1">
              {state === 'idle' ? (
                scope.value === 'titles' ? (
                  <CollapsibleSection.Scroll
                    className="flex-1"
                    contentContainerClassName="pb-28"
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                    ref={scrollRef}
                  >
                    <SuspenseSection fallback={<SeasonalAnimeRow.Skeleton season={animeSeason} />}>
                      <SeasonalAnimeRow onItemActions={openActions} season={animeSeason} />
                    </SuspenseSection>
                    <SuspenseSection fallback={<AnimeMoviesRow.Skeleton season={animeSeason} />}>
                      <AnimeMoviesRow onItemActions={openActions} season={animeSeason} />
                    </SuspenseSection>
                    <SuspenseSection fallback={<TrendingMoviesRow.Skeleton />}>
                      <TrendingMoviesRow onItemActions={openActions} />
                    </SuspenseSection>
                    <SuspenseSection fallback={<TrendingShowsRow.Skeleton />}>
                      <TrendingShowsRow onItemActions={openActions} />
                    </SuspenseSection>
                    <FeedEnd
                      onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion })}
                    />
                  </CollapsibleSection.Scroll>
                ) : (
                  <View className="flex-1">
                    <PosterWall key={scope.value} subject={scope.value} />
                    <View className="flex-1 justify-end md:justify-center px-6 pb-24 md:px-16 md:pb-16">
                      <Text className="text-5xl text-muted mb-4">忍</Text>
                      <Text className="text-2xl font-display text-foreground">{scope.label}</Text>
                      <Text className="text-base font-sans text-muted mt-3 max-w-sm leading-relaxed">
                        {scopeWelcome(scope.value, readingLabel)}
                      </Text>
                    </View>
                  </View>
                )
              ) : state === 'loading' ? (
                <ResultsSkeleton scope={scope.value} />
              ) : state === 'error' ? (
                <CenteredNotice className="-mt-16">
                  <CenteredNotice.Title>Search failed</CenteredNotice.Title>
                  <CenteredNotice.Body>Check your connection and try again.</CenteredNotice.Body>
                  <CenteredNotice.Action
                    icon={<Button.Icon name="refresh" />}
                    label="Try again"
                    loading={fetching}
                    onPress={retryFailed}
                  />
                </CenteredNotice>
              ) : state === 'empty' ? (
                <CenteredNotice className="-mt-16">
                  <CenteredNotice.Icon name="search-outline" />
                  <CenteredNotice.Title>No results</CenteredNotice.Title>
                  <CenteredNotice.Body>
                    Nothing matched “{query.trim()}”{reading ? ` in ${readingLabel}` : ''}.
                  </CenteredNotice.Body>
                  {reading ? (
                    <CenteredNotice.Action
                      icon={<Button.Icon name="search-outline" />}
                      label="Search movies & TV"
                      onPress={() => setScope('titles')}
                    />
                  ) : null}
                </CenteredNotice>
              ) : (
                <AnimatedView
                  className="flex-1"
                  style={{
                    opacity: sections.some((section) => section.search.isPlaceholderData) ? 0.6 : 1,
                    transitionProperty: 'opacity',
                    transitionDuration: DURATION.swap,
                    transitionTimingFunction: EASE_OUT,
                  }}
                >
                  <List
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
                          byline={row.byline}
                          item={row.item}
                          onActions={openActions}
                          onPress={openDetails}
                        />
                      ) : row.kind === 'entity' ? (
                        <EntityResultRow onPress={pushRoute} row={row} />
                      ) : row.kind === 'loading' ? (
                        <ResultRowSkeleton scope={scope.value} />
                      ) : (
                        <View className="px-6 py-2 flex-row items-center justify-between gap-3">
                          <Text className="shrink text-muted font-sans text-sm">
                            Search failed for this source.
                          </Text>
                          <Button
                            icon={<Button.Icon name="refresh" />}
                            label="Try again"
                            loading={row.retrying}
                            onPress={row.onRetry}
                            size="sm"
                            variant="quiet"
                          />
                        </View>
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
                dismissKeyboardNow();
                setScopeOpen(true);
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <PickerSheet
        onClose={() => setScopeOpen(false)}
        onSelect={setScope}
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
      <CardActionsSheet {...sheetProps} canHide={false} providerLinks="connected" />
    </View>
  );
}
