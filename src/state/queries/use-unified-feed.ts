import {
  useQueries,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';
import type { SeasonalAnimePage } from '@/lib/providers/anilist/reads';

import { providersForFeed } from '@/lib/providers/routing';
import { getTrending } from '@/lib/providers/simkl/reads';
import type { ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import {
  animeSeasonAt,
  type AnimeFormatFilter,
  type AnimeSeasonWindow,
} from '@/lib/providers/anilist/season';
import { useHiddenItems } from '@/state/prefs/hidden-items';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { anilistQueryKeys, fetchSeasonalAnime } from './anilist';
import { letterboxdQueryKeys, letterboxdWatchlistOptions } from './letterboxd';
import { simklDeps, simklQueryKeys } from './simkl';
import { serializdQueryKeys } from './serializd';
import { refreshUpNextInputs } from './up-next';
import { refreshWatchlistInputs } from './watchlist';

/** One named row of the home feed — never index into the query array. */
type FeedSlot =
  | 'trendingMovies'
  | 'trendingShows'
  | 'seasonalAnime'
  | 'animeMovies'
  | 'yourWatchlist';

export interface UnifiedFeedResult {
  /** Public trending catalogues — always fetched, feed is never empty. */
  trendingMovies: NormalizedMediaItem[];
  trendingShows: NormalizedMediaItem[];
  /** Popular anime series of the current cour (e.g. Summer 2026). */
  seasonalAnime: NormalizedMediaItem[];
  /** Which cour `seasonalAnime` covers — drives the row's title. */
  animeSeason: AnimeSeasonWindow;
  /** The current cour's anime films. */
  animeMovies: NormalizedMediaItem[];
  /** Letterboxd watchlist (plan 0012) — empty on web, where reads are CORS-blocked. */
  yourWatchlist: NormalizedMediaItem[];
  isLoading: boolean;
  isError: boolean;
  errors: Array<{ provider: ProviderId; error: Error }>;
  /** Refetches every feed query in parallel; resolves once all settle. */
  refetch: () => Promise<unknown>;
}

type FeedData = NormalizedMediaItem[] | SeasonalAnimePage;

interface FeedQueryConfig {
  slot: FeedSlot;
  provider: ProviderId;
  queryKey: readonly unknown[];
  queryFn: (context: { signal: AbortSignal }) => Promise<FeedData>;
  select?: (data: FeedData) => NormalizedMediaItem[];
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
    queryFn: ({ signal }: { signal: AbortSignal }) => Effect.runPromise(getTrending(simklDeps(), 'movies'), { signal }),
    staleTime: CATALOGUE_STALE_MS,
  }),
  trendingShows: () => ({
    queryKey: simklQueryKeys.trending('tv'),
    queryFn: ({ signal }: { signal: AbortSignal }) => Effect.runPromise(getTrending(simklDeps(), 'tv'), { signal }),
    staleTime: CATALOGUE_STALE_MS,
  }),
  // `TV` (everything but films) — the row is titled "Anime series of …" and
  // the films have their own row below it.
  seasonalAnime: (season: AnimeSeasonWindow, format: AnimeFormatFilter = 'TV') => ({
    queryKey: anilistQueryKeys.seasonalAnime(season, format),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchSeasonalAnime(season, format, 1, signal),
    select: (data: FeedData) => Array.isArray(data) ? data : data.items,
    staleTime: CATALOGUE_STALE_MS,
  }),
  // Personal rows — only fetched while their provider is connected.
  yourWatchlist: (username: string) => letterboxdWatchlistOptions(username),
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
      ...feedOptions.seasonalAnime(season, 'TV'),
    },
    {
      slot: 'animeMovies',
      provider: 'anilist',
      ...feedOptions.seasonalAnime(season, 'MOVIE'),
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

export function useTrendingMoviesQuery() {
  return useQuery(feedOptions.trendingMovies());
}

export function useSuspenseTrendingShowsQuery() {
  return useSuspenseQuery(feedOptions.trendingShows());
}

export function useSuspenseSeasonalAnimeQuery(
  season: AnimeSeasonWindow,
  format: AnimeFormatFilter = 'TV',
) {
  return useSuspenseQuery(feedOptions.seasonalAnime(season, format));
}

export function useSuspenseAnimeMoviesQuery(season: AnimeSeasonWindow) {
  return useSuspenseQuery(feedOptions.seasonalAnime(season, 'MOVIE'));
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
 * Pull-to-refresh for the home feed: refreshes every section Home renders in
 * parallel and resolves once all settle. The catalogue slots belong to Search,
 * so they stay out. The gathers go through their refresh helpers, which mark
 * each leg stale first; refetching a gather alone re-serves cached legs.
 */
export function useRefetchUnifiedFeed() {
  const queryClient = useQueryClient();
  const connected = useConnectedProviders();

  function refetch() {
    const feedProviders = providersForFeed(connected);
    // allSettled, not all: one provider failing to refresh must not hide the
    // outcome of the others (partial-failure contract, AGENTS.md).
    return Promise.allSettled([
      ...(hasUpNextSources(connected) ? [refreshUpNextInputs(queryClient)] : []),
      // Also refreshes Letterboxd's own row, which reads the gather's page 1.
      ...(feedProviders.length > 0 ? [refreshWatchlistInputs(queryClient)] : []),
      ...(feedProviders.includes('letterboxd')
        ? [queryClient.refetchQueries({ queryKey: letterboxdQueryKeys.listsRoot() })]
        : []),
      ...(feedProviders.includes('serializd')
        ? [queryClient.refetchQueries({ queryKey: serializdQueryKeys.listsRoot() })]
        : []),
    ]);
  }

  return refetch;
}

/**
 * Observes cached feed rows for item resolution without fetching Home's
 * catalogues on detail or episode navigation. Cold links have their own ID
 * queries; explicit refresh can still refetch these observers.
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

  const results = useQueries({ queries: queries.map((query) => ({ ...query, enabled: false })) });

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
    animeMovies: bySlot('animeMovies'),
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
