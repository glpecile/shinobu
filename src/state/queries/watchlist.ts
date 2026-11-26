import {
  experimental_streamedQuery as streamedQuery,
  hashKey,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import type { WatchlistInput, WatchlistInputs } from '@/features/watchlist/types';
import { WATCHLIST_PAGE_SIZE } from '@/lib/providers/letterboxd/watchlist';
import { providersForFeed } from '@/lib/providers/routing';
import { getAllItems } from '@/lib/providers/simkl/reads';
import { getWatchlist } from '@/lib/providers/trakt/reads';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { currentUsableProviders, useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import type { NormalizedMediaItem } from '@/types/media';

import { anilistQueryKeys, fetchWatchlistAnime, fetchWatchlistManga } from './anilist';
import { fetchHardcoverWantToRead, hardcoverQueryKeys } from './hardcover';
import { letterboxdQueryKeys, letterboxdWatchlistPagesOptions } from './letterboxd';
import { none, settle, streamLegs } from './settle';
import { simklDeps, simklQueryKeys } from './simkl';
import { traktDeps, traktQueryKeys } from './trakt';
import { WATCHLIST_QUERY_ROOT } from './watchlist-cache';

/** Cache watchlist inputs per provider and merge them on read. */

export const watchlistQueryKeys = {
  /** Shared root so the disconnect purge in `state/session` can't drift. */
  all: [...WATCHLIST_QUERY_ROOT],
  inputs: () => [...watchlistQueryKeys.all, 'inputs'] as const,
};

/** Listen only for changes to the gathered inputs, not query creation elsewhere during render. */
export function subscribeWatchlistInputs(queryClient: QueryClient, onStoreChange: () => void) {
  const inputsHash = hashKey(watchlistQueryKeys.inputs());
  return queryClient.getQueryCache().subscribe((event) => {
    if (
      (event.type === 'updated' || event.type === 'removed') &&
      event.query.queryHash === inputsHash
    ) {
      onStoreChange();
    }
  });
}

/**
 * A watchlist changes only when the user changes it, and the user's own changes
 * are event-driven (`invalidateAfterWatchlist` names this key), so staleness
 * only ever covers another device's edits — 15 minutes plus pull-to-refresh.
 * Matches `CALENDAR_STALE_MS` / `CATALOGUE_STALE_MS`.
 */
export const WATCHLIST_STALE_MS = 15 * 60_000;

export type { WatchlistInput, WatchlistInputs };

/** Serializd has no read leg until its watchlist membership shape is verified. */
const WATCHLIST_READ_PROVIDERS: readonly ProviderId[] = [
  Provider.Trakt,
  Provider.AniList,
  Provider.Letterboxd,
  Provider.Simkl,
  Provider.Hardcover,
];

export function watchlistReadProviders(connected: readonly ProviderId[]): ProviderId[] {
  return providersForFeed(connected).filter((id) => WATCHLIST_READ_PROVIDERS.includes(id));
}

/** Trakt's type=all read covers movies and shows in one call. */
async function traktInputs(queryClient: QueryClient): Promise<WatchlistInput[]> {
  const items = await queryClient.fetchQuery({
    queryKey: traktQueryKeys.watchlist('all', 'added', 'desc'),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        getWatchlist(traktDeps(), { type: 'all', sortBy: 'added', sortHow: 'desc' }),
        { signal },
      ),
    staleTime: WATCHLIST_STALE_MS,
  });
  // `normalizeWatchlistRow` puts `listed_at` in `lastUpdated` precisely so the
  // merge can order by add-time (KTD-11); `nowIso` would make every row equal.
  return items.map((item) => ({ item, source: Provider.Trakt, addedAt: item.lastUpdated }));
}

/**
 * Reuse shared AniList list reads. Include Current and Planning for anime, and Planning only
 * for manga. These reads have no added-at timestamp.
 */
async function anilistInputs(queryClient: QueryClient): Promise<WatchlistInput[]> {
  const [anime, manga] = await Promise.all([
    fetchWatchlistAnime(queryClient),
    fetchWatchlistManga(queryClient),
  ]);
  return [...anime, ...manga].map((entry) => ({
    item: entry.item,
    source: Provider.AniList,
    anilistStatus: entry.status,
    ...(entry.entryId != null ? { entryId: entry.entryId } : {}),
  }));
}

interface WatchlistPages {
  pages: NormalizedMediaItem[][];
}

/**
 * Use loaded Letterboxd pages for dedupe. A gather initially loads one page and never
 * auto-pages the full list.
 */
/**
 * Whether Letterboxd's leg has read the user's whole watchlist, judged from the
 * same cached infinite entry the leg itself resolves to.
 *
 * A full last page means `getNextPageParam` handed out another cursor, so there
 * are films this gather has not seen. That is not a failure and never renders a
 * notice — but it is the difference between "Letterboxd does not have this film"
 * and "we have not looked", which R35 requires the removal path to tell apart.
 */
function letterboxdLegIsComplete(queryClient: QueryClient): boolean {
  const username = getLetterboxdUsername() ?? '';
  if (username === '') return true;
  const cached = queryClient.getQueryData<WatchlistPages>(
    letterboxdQueryKeys.watchlistPages(username),
  );
  const lastPage = cached?.pages.at(-1);
  return lastPage == null || lastPage.length < WATCHLIST_PAGE_SIZE;
}

async function letterboxdInputs(queryClient: QueryClient): Promise<WatchlistInput[]> {
  const username = getLetterboxdUsername() ?? '';
  if (username === '') return [];
  const queryKey = letterboxdQueryKeys.watchlistPages(username);
  const cached = queryClient.getQueryData<WatchlistPages>(queryKey);
  const data = await queryClient.fetchInfiniteQuery({
    ...letterboxdWatchlistPagesOptions(queryClient, username),
    pages: Math.max(cached?.pages.length ?? 1, 1),
    staleTime: WATCHLIST_STALE_MS,
  });
  return data.pages.flat().map((item) => ({ item, source: Provider.Letterboxd }));
}

/** Simkl applies the bare status filter to every media bucket. */
async function simklInputs(queryClient: QueryClient): Promise<WatchlistInput[]> {
  const library = await queryClient.fetchQuery({
    queryKey: simklQueryKeys.allItems(undefined, 'plantowatch'),
    queryFn: ({ signal }) =>
      Effect.runPromise(getAllItems(simklDeps(), { status: 'plantowatch' }), { signal }),
    staleTime: WATCHLIST_STALE_MS,
  });
  const entries = [...library.shows, ...library.movies, ...library.anime];
  return entries.map((entry) => ({
    item: entry.item,
    source: Provider.Simkl,
    ...(entry.addedToWatchlistAt != null ? { addedAt: entry.addedToWatchlistAt } : {}),
    // Keep a zero history count as positive evidence for the destructive removal warning.
    simklWatchedCount: entry.item.currentProgress,
  }));
}

async function hardcoverInputs(queryClient: QueryClient): Promise<WatchlistInput[]> {
  const entries = await fetchHardcoverWantToRead(queryClient);
  return entries.map((entry) => ({
    item: entry.item,
    source: Provider.Hardcover,
    addedAt: entry.addedAt,
  }));
}

/** Gather each eligible watchlist in parallel and settle failures independently. */
function streamWatchlistInputs(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
): AsyncGenerator<WatchlistInputs> {
  const feedProviders = watchlistReadProviders(connected);
  return streamLegs(
    // In `WATCHLIST_READ_PROVIDERS` order: `incomplete` finds a leg by its index.
    [
      feedProviders.includes(Provider.Trakt)
        ? settle(Provider.Trakt, () => traktInputs(queryClient))
        : none<WatchlistInput>(),
      feedProviders.includes(Provider.AniList)
        ? settle(Provider.AniList, () => anilistInputs(queryClient))
        : none<WatchlistInput>(),
      feedProviders.includes(Provider.Letterboxd)
        ? settle(Provider.Letterboxd, () => letterboxdInputs(queryClient))
        : none<WatchlistInput>(),
      feedProviders.includes(Provider.Simkl)
        ? settle(Provider.Simkl, () => simklInputs(queryClient))
        : none<WatchlistInput>(),
      feedProviders.includes(Provider.Hardcover)
        ? settle(Provider.Hardcover, () => hardcoverInputs(queryClient))
        : none<WatchlistInput>(),
    ],
    (legs) => {
      const settled = legs.map((leg) => leg ?? none<WatchlistInput>());
      // A pending leg or unread Letterboxd page means membership is incomplete. Failures are
      // reported through errors.
      const incomplete = WATCHLIST_READ_PROVIDERS.filter(
        (provider, index) =>
          feedProviders.includes(provider) &&
          (legs[index] == null ||
            (provider === Provider.Letterboxd &&
              settled[index].errors.length === 0 &&
              !letterboxdLegIsComplete(queryClient))),
      );
      return {
        inputs: settled.flatMap((leg) => leg.inputs),
        errors: settled.flatMap((leg) => leg.errors),
        incomplete,
      };
    },
    (partial) => partial.inputs.length > 0,
  );
}

const NO_WATCHLIST_INPUTS: WatchlistInputs = { inputs: [], errors: [], incomplete: [] };

export async function fetchWatchlistInputs(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
): Promise<WatchlistInputs> {
  let inputs = NO_WATCHLIST_INPUTS;
  for await (const partial of streamWatchlistInputs(queryClient, connected)) inputs = partial;
  return inputs;
}

/**
 * Streams like `upNextOptions`: a cold grid renders once the first provider
 * with rows settles, and a refetch holds the old inputs until all are back.
 */
export function watchlistOptions(queryClient: QueryClient) {
  return {
    queryKey: watchlistQueryKeys.inputs(),
    queryFn: streamedQuery<WatchlistInputs, WatchlistInputs>({
      streamFn: (context) => {
        // Reading the signal lets streamedQuery stop cache writes after a purge.
        void context.signal;
        return streamWatchlistInputs(queryClient, currentUsableProviders());
      },
      reducer: (_previous, partial) => partial,
      initialValue: NO_WATCHLIST_INPUTS,
      refetchMode: 'replace',
    }),
    staleTime: WATCHLIST_STALE_MS,
  };
}

/** Mark the provider entries stale before refetching the gather, including on retry. */
export async function refreshWatchlistInputs(queryClient: QueryClient): Promise<void> {
  const username = getLetterboxdUsername();
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.watchlistRoot() }),
    queryClient.invalidateQueries({
      queryKey: anilistQueryKeys.currentAnimeEntries(),
    }),
    queryClient.invalidateQueries({
      queryKey: anilistQueryKeys.currentMangaEntries(),
    }),
    // Invalidate the whole Simkl prefix because a prior write can move an item out of
    // plan-to-watch.
    queryClient.invalidateQueries({ queryKey: simklQueryKeys.allItemsRoot() }),
    queryClient.invalidateQueries({ queryKey: hardcoverQueryKeys.libraryRoot() }),
    ...(username == null
      ? []
      : [
          // Invalidate page 1 before an active grid can refetch through it.
          queryClient.invalidateQueries({
            queryKey: letterboxdQueryKeys.watchlist(username),
          }),
          queryClient.invalidateQueries({
            queryKey: letterboxdQueryKeys.watchlistPages(username),
          }),
        ]),
  ]);
  await queryClient.refetchQueries({ queryKey: watchlistQueryKeys.inputs() });
}

/**
 * The raw gathered inputs, suspended. Consumers want *entries*, so they go
 * through `features/watchlist/use-watchlist-entries.ts` — this exists for it
 * and for tests, not as a screen-level hook.
 */
export function useSuspenseWatchlistInputsQuery(): WatchlistInputs {
  const queryClient = useQueryClient();
  // Rebinds after a purge, like `useSuspenseUpNextQuery`.
  useConnectedProviders();
  return useSuspenseQuery(watchlistOptions(queryClient)).data;
}
