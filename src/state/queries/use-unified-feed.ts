import {
  useQueries,
  useQueryClient,
  useSuspenseQueries,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { allSettled } from 'better-all';
import { Effect } from 'effect';

import { providersForFeed } from '@/lib/providers/routing';
import { getAllItems, getTrending } from '@/lib/providers/simkl/reads';
import type { ProviderId } from '@/lib/providers/types';
import { getWatchedShows } from '@/lib/providers/trakt/reads';
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
import { simklDeps, simklQueryKeys } from './simkl';
import { traktDeps, traktQueryKeys } from './trakt';
import { upNextQueryKeys } from './up-next';
import { watchlistQueryKeys } from './watchlist';

/**
 * One named row of the home feed — never index into the query array.
 * `yourShowsSimkl` is internal-only: it never reaches `UnifiedFeedResult`, it
 * exists so Simkl's leg of the `yourShows` merge can be its own cache entry
 * (provider-scoped invalidation, KTD-5) while the exposed `yourShows` field is
 * the merged row.
 */
type FeedSlot =
  | 'trendingMovies'
  | 'trendingShows'
  | 'seasonalAnime'
  | 'yourShows'
  | 'yourShowsSimkl'
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
  yourShows: () => ({
    queryKey: traktQueryKeys.watchedShows(),
    queryFn: () => Effect.runPromise(getWatchedShows(traktDeps())),
  }),
  /**
   * Simkl's leg of the `yourShows` merge (plan 0034 KTD-10/R10): the whole
   * library in one call (shows + anime buckets; movies dropped — this is a TV
   * row), `plantowatch` excluded — that status is the watchlist, not "shows
   * I'm engaged with", the same distinction Trakt's `/sync/watched/shows`
   * draws by construction. One unfiltered `getAllItems` call rather than two
   * type-filtered ones, matching Trakt's own `type=all` one-call watchlist
   * read (R26) instead of widening the mount-time request burst.
   */
  yourShowsSimkl: () => ({
    queryKey: simklQueryKeys.allItems(),
    queryFn: async (): Promise<NormalizedMediaItem[]> => {
      const library = await Effect.runPromise(getAllItems(simklDeps(), {}));
      return [...library.shows, ...library.anime]
        .filter((entry) => entry.status !== 'plantowatch')
        .map((entry) => entry.item);
    },
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
 * The merge key for one `yourShows` row: its TMDB id, or its own id when none
 * exists (an anime Simkl carries no TMDB bridge for) — the `id:`/`tmdb:`
 * prefixes keep those two key spaces from ever colliding.
 */
function yourShowsMergeKey(item: NormalizedMediaItem): string {
  return item.externalIds.tmdb != null ? `tmdb:${item.externalIds.tmdb}` : `id:${item.id}`;
}

/**
 * Merge Trakt's and Simkl's `yourShows` rows by TMDB id, Simkl winning a
 * metadata conflict (plan 0034 KTD-10/R10) — the same "later write wins" Map
 * idiom `features/watchlist/compute.ts`'s merge uses, simplified to one key
 * since both legs are TMDB-keyed TV/anime catalogues.
 */
export function mergeYourShows(
  trakt: readonly NormalizedMediaItem[],
  simkl: readonly NormalizedMediaItem[],
): NormalizedMediaItem[] {
  const order: string[] = [];
  const byKey = new Map<string, NormalizedMediaItem>();
  for (const item of [...trakt, ...simkl]) {
    const key = yourShowsMergeKey(item);
    if (!byKey.has(key)) order.push(key);
    // Trakt inserts first, Simkl second — a later `set` on the same key
    // overwrites, which is exactly what hands Simkl the win.
    byKey.set(key, item);
  }
  return order.map((key) => byKey.get(key) as NormalizedMediaItem);
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

  if (feedProviders.includes('trakt')) {
    configs.push({
      slot: 'yourShows',
      provider: 'trakt',
      ...feedOptions.yourShows(),
    });
  }
  if (feedProviders.includes('simkl')) {
    configs.push({
      slot: 'yourShowsSimkl',
      provider: 'simkl',
      ...feedOptions.yourShowsSimkl(),
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

/**
 * The "Your Shows" row: Trakt's watched shows merged with Simkl's, Simkl
 * winning metadata conflicts (plan 0034 KTD-10/R10). Two independent cache
 * entries — `useSuspenseQueries`, not one combined queryFn — so a Simkl-only
 * log invalidation (`simklQueryKeys.allItemsRoot()`) never refetches Trakt's
 * leg and vice versa, matching the up-next/watchlist gatherers' "raw
 * per-provider inputs, merged at render time" idiom.
 */
export function useSuspenseYourShowsQuery() {
  const connected = useConnectedProviders();
  const feedProviders = providersForFeed(connected);
  const includeTrakt = feedProviders.includes('trakt');
  const includeSimkl = feedProviders.includes('simkl');
  const queries = [
    ...(includeTrakt ? [feedOptions.yourShows()] : []),
    ...(includeSimkl ? [feedOptions.yourShowsSimkl()] : []),
  ];
  const results = useSuspenseQueries({ queries });
  const trakt = includeTrakt ? results[0].data : [];
  const simkl = includeSimkl ? results[includeTrakt ? 1 : 0].data : [];
  return { data: mergeYourShows(trakt, simkl) };
}

export function useSuspenseYourAnimeQuery() {
  const queryClient = useQueryClient();
  return useSuspenseQuery(feedOptions.yourAnime(queryClient));
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
    // Merged first (raw legs), hidden filter applied to the merge result —
    // the same order the Trakt-only slot used, just with a Simkl leg joined
    // in first (KTD-10).
    yourShows: filterHidden(mergeYourShows(rawSlot('yourShows'), rawSlot('yourShowsSimkl'))),
    yourAnime: bySlot('yourAnime'),
    yourWatchlist: bySlot('yourWatchlist'),
    isLoading,
    isError,
    errors,
    refetch,
  };
}
