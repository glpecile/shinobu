import {
  useQueries,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { allSettled } from 'better-all';
import { Effect } from 'effect';

import { providersForFeed } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import {
  getTrendingMovies,
  getTrendingShows,
  getWatchedShows,
} from '@/lib/providers/trakt/reads';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import {
  animeSeasonAt,
  type AnimeSeasonWindow,
} from '@/lib/providers/anilist/season';
import { getWatchlist } from '@/lib/providers/letterboxd/watchlist';
import { useHiddenItems } from '@/state/prefs/hidden-items';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import {
  anilistQueryKeys,
  fetchCurrentAnime,
  fetchSeasonalAnime,
} from './anilist';
import { letterboxdDeps, letterboxdQueryKeys } from './letterboxd';
import { traktDeps, traktQueryKeys } from './trakt';
import { upNextQueryKeys } from './up-next';
import { watchlistQueryKeys } from './watchlist';

/** One named row of the home feed — never index into the query array. */
type FeedSlot =
  | 'trendingMovies'
  | 'trendingShows'
  | 'seasonalAnime'
  | 'yourShows'
  | 'yourAnime'
  | 'yourWatchlist';

export interface UnifiedFeedResult {
  /** Public trending catalogues — always fetched, feed is never empty. */
  trendingMovies: NormalizedMediaItem[];
  trendingShows: NormalizedMediaItem[];
  /** Popular anime of the current cour (e.g. Summer 2026). */
  seasonalAnime: NormalizedMediaItem[];
  /** Which cour `seasonalAnime` covers — drives the row's title. */
  animeSeason: AnimeSeasonWindow;
  /** Personal in-progress rows from connected providers. */
  yourShows: NormalizedMediaItem[];
  yourAnime: NormalizedMediaItem[];
  /** Letterboxd watchlist (plan 0012) — empty on web, where reads are CORS-blocked. */
  yourWatchlist: NormalizedMediaItem[];
  isLoading: boolean;
  isError: boolean;
  errors: Array<{ provider: ProviderId; error: Error }>;
  /** Refetches every feed query in parallel; resolves once all settle. */
  refetch: () => Promise<unknown>;
}

interface FeedQueryConfig {
  slot: FeedSlot;
  provider: ProviderId;
  queryKey: readonly unknown[];
  queryFn: () => Promise<NormalizedMediaItem[]>;
  staleTime?: number;
}

/**
 * Public catalogue rows move slowly (trending/popularity rankings, not user
 * state) — a long staleTime keeps home ↔ details navigation from re-spending
 * provider rate budget on every remount (AniList's is 30 req/min,
 * docs/solutions/anilist-rate-limit-retry-storm.md).
 */
const CATALOGUE_STALE_MS = 15 * 60_000;

/**
 * Query options per feed slot — the single definition of each row's key and
 * fetcher, shared by the per-row suspense hooks (home), the aggregate
 * `useUnifiedFeed` (details by-id resolution), and `useRefetchUnifiedFeed`,
 * so all three always hit the same cache entries.
 */
const feedOptions = {
  // Public catalogues — no session required.
  trendingMovies: () => ({
    queryKey: traktQueryKeys.trendingMovies(),
    queryFn: () => Effect.runPromise(getTrendingMovies(traktDeps())),
    staleTime: CATALOGUE_STALE_MS,
  }),
  trendingShows: () => ({
    queryKey: traktQueryKeys.trendingShows(),
    queryFn: () => Effect.runPromise(getTrendingShows(traktDeps())),
    staleTime: CATALOGUE_STALE_MS,
  }),
  seasonalAnime: (season: AnimeSeasonWindow) => ({
    queryKey: anilistQueryKeys.seasonalAnime(season),
    queryFn: () => fetchSeasonalAnime(season),
    staleTime: CATALOGUE_STALE_MS,
  }),
  // Personal rows — only fetched while their provider is connected.
  yourShows: () => ({
    queryKey: traktQueryKeys.watchedShows(),
    queryFn: () => Effect.runPromise(getWatchedShows(traktDeps())),
  }),
  yourAnime: (queryClient: QueryClient) => ({
    queryKey: anilistQueryKeys.currentAnime(),
    queryFn: () => fetchCurrentAnime(queryClient),
  }),
  yourWatchlist: (username: string) => ({
    queryKey: letterboxdQueryKeys.watchlist(username),
    queryFn: () => Effect.runPromise(getWatchlist(letterboxdDeps())),
  }),
};

/**
 * The slot configs that apply right now: public catalogues always, personal
 * rows only when their provider is connected (and, for Letterboxd, when reads
 * work on this platform and a username is stored).
 */
function activeFeedConfigs(
  connected: readonly ProviderId[],
  queryClient: QueryClient,
  season: AnimeSeasonWindow,
): FeedQueryConfig[] {
  const feedProviders = providersForFeed(connected);
  const configs: FeedQueryConfig[] = [
    { slot: 'trendingMovies', provider: 'trakt', ...feedOptions.trendingMovies() },
    { slot: 'trendingShows', provider: 'trakt', ...feedOptions.trendingShows() },
    {
      slot: 'seasonalAnime',
      provider: 'anilist',
      ...feedOptions.seasonalAnime(season),
    },
  ];

  if (feedProviders.includes('trakt')) {
    configs.push({
      slot: 'yourShows',
      provider: 'trakt',
      ...feedOptions.yourShows(),
    });
  }
  if (feedProviders.includes('anilist')) {
    configs.push({
      slot: 'yourAnime',
      provider: 'anilist',
      ...feedOptions.yourAnime(queryClient),
    });
  }
  if (feedProviders.includes('letterboxd')) {
    // The `feedProviders` gate also keeps this MMKV read out of web SSR renders
    // (empty in the server snapshot — docs/solutions/expo-web-ssr-mmkv-storage-on-server.md).
    const letterboxdUsername = getLetterboxdUsername();
    if (letterboxdUsername != null) {
      configs.push({
        slot: 'yourWatchlist',
        provider: 'letterboxd',
        ...feedOptions.yourWatchlist(letterboxdUsername),
      });
    }
  }

  return configs;
}

// --- Per-row suspense hooks -------------------------------------------------
// Home mounts each feed row under its own `SuspenseSection` (AGENTS.md
// "Loading & Error States"), so one provider failing hides one row, never the
// whole feed. Each hook backs exactly one row component in features/feed.

export function useSuspenseTrendingMoviesQuery() {
  return useSuspenseQuery(feedOptions.trendingMovies());
}

export function useSuspenseTrendingShowsQuery() {
  return useSuspenseQuery(feedOptions.trendingShows());
}

export function useSuspenseSeasonalAnimeQuery(season: AnimeSeasonWindow) {
  return useSuspenseQuery(feedOptions.seasonalAnime(season));
}

export function useSuspenseYourShowsQuery() {
  return useSuspenseQuery(feedOptions.yourShows());
}

export function useSuspenseYourAnimeQuery() {
  const queryClient = useQueryClient();
  return useSuspenseQuery(feedOptions.yourAnime(queryClient));
}

// No `useSuspenseYourWatchlistQuery`: the home row is no longer one provider's
// watchlist — it reads the merged gather (plan 0031 R25,
// `features/watchlist/use-watchlist-entries.ts`). The `yourWatchlist` slot
// stays because the details screen still resolves Letterboxd films by id out
// of that cache entry, which Up Next's release resolve keeps warm anyway.

/**
 * Home sections that are query-backed but not `NormalizedMediaItem[]` rows, so
 * they never join `activeFeedConfigs` (the details screen's by-id resolution
 * must not trigger Up Next's per-show request fan). Pull-to-refresh still owns
 * them — this is the sibling registration plan 0019 U4 calls for.
 */
function activeSectionKeys(
  connected: readonly ProviderId[],
): Array<{ slot: string; queryKey: readonly unknown[] }> {
  const feedProviders = providersForFeed(connected);
  if (feedProviders.length === 0) return [];
  const keys: Array<{ slot: string; queryKey: readonly unknown[] }> = [];
  if (feedProviders.includes('trakt') || feedProviders.includes('anilist')) {
    keys.push({ slot: 'upNext', queryKey: upNextQueryKeys.inputs() });
  }
  // The merged watchlist (plan 0031 KTD-11) — registered here for
  // pull-to-refresh, **never** as a `feedOptions` slot: the slot contract is
  // `NormalizedMediaItem[]` and `useUnifiedFeed` is also mounted by the details
  // screen, so a slot would break the type *and* run the whole gather on every
  // details open. The old `trakt`/`anilist` early return moved into the branch
  // above for the same unit: a Letterboxd-only user — the one user who has this
  // row today — must still reach their own watchlist through refresh.
  keys.push({ slot: 'watchlist', queryKey: watchlistQueryKeys.inputs() });
  if (feedProviders.includes('anilist')) {
    // The network read behind the "Your Anime" row: refetching only the
    // derived items key would re-derive from this cached entry (plan 0019 U2).
    keys.push({
      slot: 'currentAnimeEntries',
      queryKey: anilistQueryKeys.currentAnimeEntries(),
    });
  }
  return keys;
}

/**
 * Pull-to-refresh for the home feed: refetches every applicable feed query in
 * parallel and resolves once all settle. Kept out of the row hooks so the
 * screen-level `RefreshableScrollView` has one promise to wait on.
 */
export function useRefetchUnifiedFeed() {
  const queryClient = useQueryClient();
  const connected = useConnectedProviders();

  function refetch() {
    const targets = [
      ...activeFeedConfigs(connected, queryClient, animeSeasonAt(new Date())),
      ...activeSectionKeys(connected),
    ];
    // allSettled, not all: one provider failing to refresh must not hide the
    // outcome of the others (partial-failure contract, AGENTS.md).
    return allSettled(
      Object.fromEntries(
        targets.map((target): [string, () => Promise<void>] => [
          target.slot,
          () => queryClient.refetchQueries({ queryKey: target.queryKey }),
        ]),
      ),
    );
  }

  return refetch;
}

/**
 * Aggregates every connected, read-capable provider into one normalized feed
 * (plan.md 2.1). Home no longer consumes this — it renders per-row suspense
 * hooks under boundaries; this aggregate remains for consumers that resolve
 * an item by id across every row (the details screen, which must find an item
 * wherever it came from). Results are keyed by named slot, not array
 * position — the query list is conditional in two dimensions.
 *
 * `includeHidden` skips the hidden-items filter — for consumers that resolve
 * an item by id rather than display rows (the details screen must render
 * hidden items: Manage Trackers' hidden list links there).
 */
export function useUnifiedFeed(
  options: { includeHidden?: boolean } = {},
): UnifiedFeedResult {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  const animeSeason = animeSeasonAt(new Date());
  const queries = activeFeedConfigs(connected, queryClient, animeSeason);

  const results = useQueries({ queries });

  // Items the user hid (card actions dialog) drop out of every row here, at
  // the aggregation boundary — screens never re-filter. Query caches keep the
  // full lists, so unhiding is instant, no refetch.
  const hiddenItems = useHiddenItems();
  const hiddenIds = new Set(
    options.includeHidden === true
      ? []
      : hiddenItems.map((hidden) => hidden.id),
  );

  const bySlot = (slot: FeedSlot): NormalizedMediaItem[] => {
    const index = queries.findIndex((query) => query.slot === slot);
    const data = (index >= 0 ? results[index]?.data : undefined) ?? [];
    return hiddenIds.size === 0
      ? data
      : data.filter((item) => !hiddenIds.has(item.id));
  };

  const isLoading = results.some((result) => result.isLoading);
  const isError = results.some((result) => result.isError);

  const errors = results
    .map((result, index) => ({
      provider: queries[index].provider,
      error: result.error,
    }))
    .filter(
      (entry): entry is { provider: ProviderId; error: Error } =>
        entry.error != null,
    );

  function refetch() {
    // allSettled, not all: one provider failing to refresh must not hide the
    // outcome of the others (partial-failure contract, AGENTS.md).
    return allSettled(
      Object.fromEntries(
        results.map((result, index): [string, () => Promise<unknown>] => [
          queries[index].slot,
          () => result.refetch(),
        ]),
      ),
    );
  }

  return {
    trendingMovies: bySlot('trendingMovies'),
    trendingShows: bySlot('trendingShows'),
    seasonalAnime: bySlot('seasonalAnime'),
    animeSeason,
    yourShows: bySlot('yourShows'),
    yourAnime: bySlot('yourAnime'),
    yourWatchlist: bySlot('yourWatchlist'),
    isLoading,
    isError,
    errors,
    refetch,
  };
}
