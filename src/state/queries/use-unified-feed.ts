import {
  useQueries,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { Effect } from 'effect';

import { providersForFeed } from '@/lib/providers/routing';
import { getTrending } from '@/lib/providers/simkl/reads';
import type { ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import {
  animeSeasonAt,
  type AnimeSeasonWindow,
} from '@/lib/providers/anilist/season';
import { getWatchlist } from '@/lib/providers/letterboxd/watchlist';
import { useHiddenItems } from '@/state/prefs/hidden-items';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { anilistQueryKeys, fetchSeasonalAnime } from './anilist';
import { letterboxdDeps, letterboxdQueryKeys } from './letterboxd';
import { simklDeps, simklQueryKeys } from './simkl';
import { upNextQueryKeys } from './up-next';
import { watchlistQueryKeys } from './watchlist';

/** One named row of the home feed — never index into the query array. */
type FeedSlot =
  | 'trendingMovies'
  | 'trendingShows'
  | 'seasonalAnime'
  | 'yourWatchlist';

export interface UnifiedFeedResult {
  /** Public trending catalogues — always fetched, feed is never empty. */
  trendingMovies: NormalizedMediaItem[];
  trendingShows: NormalizedMediaItem[];
  /** Popular anime of the current cour (e.g. Summer 2026). */
  seasonalAnime: NormalizedMediaItem[];
  /** Which cour `seasonalAnime` covers — drives the row's title. */
  animeSeason: AnimeSeasonWindow;
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
/**
 * Exported for `use-unified-feed.test.ts` — the individual slot builders are
 * pure enough (given mocked provider deps) to call their `queryFn`s directly
 * without a React render, the same way `watchlist.ts` exposes
 * `fetchWatchlistInputs` for its own gatherer tests.
 */
export const feedOptions = {
  // Public catalogues — no session required. Simkl's CDN trending replaces
  // Trakt's (plan 0034 R11/KTD-8): the client id is bundled in every build,
  // unlike Trakt's post-detachment BYO-only credential, so these two rows
  // resolve with zero providers connected and no Trakt env creds at all.
  trendingMovies: () => ({
    queryKey: simklQueryKeys.trending('movies'),
    queryFn: () => Effect.runPromise(getTrending(simklDeps(), 'movies')),
    staleTime: CATALOGUE_STALE_MS,
  }),
  trendingShows: () => ({
    queryKey: simklQueryKeys.trending('tv'),
    queryFn: () => Effect.runPromise(getTrending(simklDeps(), 'tv')),
    staleTime: CATALOGUE_STALE_MS,
  }),
  seasonalAnime: (season: AnimeSeasonWindow) => ({
    queryKey: anilistQueryKeys.seasonalAnime(season),
    queryFn: () => fetchSeasonalAnime(season),
    staleTime: CATALOGUE_STALE_MS,
  }),
  // Personal rows — only fetched while their provider is connected.
  yourWatchlist: (username: string) => ({
    queryKey: letterboxdQueryKeys.watchlist(username),
    queryFn: () => Effect.runPromise(getWatchlist(letterboxdDeps())),
  }),
};

/**
 * Which providers actually feed Up Next — exported so the screen asks the data
 * layer instead of re-deriving the answer beside it. This had drifted: the
 * screen gated the section on `trakt || anilist` long after
 * `fetchUpNextInputs` grew its `wantsSimkl` leg, so a **Simkl-only** user had
 * Up Next and Continue Watching built for them and neither rendered.
 */
export function hasUpNextSources(connected: readonly ProviderId[]): boolean {
  const feedProviders = providersForFeed(connected);
  return (
    feedProviders.includes('trakt') ||
    feedProviders.includes('simkl') ||
    feedProviders.includes('anilist')
  );
}

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
    { slot: 'trendingMovies', provider: 'simkl', ...feedOptions.trendingMovies() },
    { slot: 'trendingShows', provider: 'simkl', ...feedOptions.trendingShows() },
    {
      slot: 'seasonalAnime',
      provider: 'anilist',
      ...feedOptions.seasonalAnime(season),
    },
  ];

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


/**
 * Letterboxd's **own** watchlist row, kept alongside the merged one (owner,
 * 2026-07-28: "I want to have back the letterboxd movie watchlist row, we
 * should not erase it altogether in favor of the unified row").
 *
 * Plan 0031 R25 replaced this row with the cross-provider gather; the merge is
 * still right for "everything I mean to watch", but it is not a substitute for
 * a films-only view of a list the user curates on Letterboxd itself — merged
 * with Trakt shows and AniList plans, that list stops being browsable as
 * itself. So both rows ship: the merged one answers "what am I meaning to
 * watch", this one answers "what's on my Letterboxd".
 *
 * The `yourWatchlist` slot was already staying for the details screen's by-id
 * resolution of Letterboxd films, so this row costs no extra request.
 */
export function useSuspenseYourWatchlistQuery(username: string) {
  return useSuspenseQuery(feedOptions.yourWatchlist(username));
}

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
  if (hasUpNextSources(connected)) {
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
    return Promise.allSettled(
      targets.map((target) =>
        queryClient.refetchQueries({ queryKey: target.queryKey }),
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

  const rawSlot = (slot: FeedSlot): NormalizedMediaItem[] => {
    const index = queries.findIndex((query) => query.slot === slot);
    return (index >= 0 ? results[index]?.data : undefined) ?? [];
  };
  const filterHidden = (data: NormalizedMediaItem[]): NormalizedMediaItem[] =>
    hiddenIds.size === 0 ? data : data.filter((item) => !hiddenIds.has(item.id));
  const bySlot = (slot: FeedSlot): NormalizedMediaItem[] => filterHidden(rawSlot(slot));

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
    return Promise.allSettled(results.map((result) => result.refetch()));
  }

  return {
    trendingMovies: bySlot('trendingMovies'),
    trendingShows: bySlot('trendingShows'),
    seasonalAnime: bySlot('seasonalAnime'),
    animeSeason,
    // Merged first (raw legs), hidden filter applied to the merge result —
    // the same order the Trakt-only slot used, just with a Simkl leg joined
    // in first (KTD-10).
    yourWatchlist: bySlot('yourWatchlist'),
    isLoading,
    isError,
    errors,
    refetch,
  };
}
