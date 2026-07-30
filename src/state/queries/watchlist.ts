import { useQueryClient, useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import type { WatchlistInput, WatchlistInputs } from '@/features/watchlist/types';
import {
  getWatchlistPage,
  WATCHLIST_PAGE_SIZE,
} from '@/lib/providers/letterboxd/watchlist';
import { providersForFeed } from '@/lib/providers/routing';
import { getWatchlist } from '@/lib/providers/trakt/reads';
import type { ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import type { NormalizedMediaItem } from '@/types/media';

import { anilistQueryKeys, fetchPlannedAnime } from './anilist';
import { letterboxdDeps, letterboxdQueryKeys } from './letterboxd';
import { none, settle } from './settle';
import { traktDeps, traktQueryKeys } from './trakt';
import { WATCHLIST_QUERY_ROOT } from './watchlist-cache';

/**
 * The cross-provider watchlist gatherer (plan 0031 U13/R26). Same shape as
 * `up-next.ts`: raw per-provider inputs cached under one key, merged by a pure
 * function (`features/watchlist/compute.ts`) at render time — never in the
 * `queryFn`, so a hide or a second Letterboxd page re-merges without a refetch.
 *
 * Every leg settles **independently** through the shared `settle` helper: one
 * provider's outage costs that provider's rows and an inline notice, never the
 * grid (R29/KTD-12).
 *
 * Effect stays inside the `queryFn`s here — the AGENTS.md containment boundary.
 * No `Effect<…>` appears in any exported signature.
 */

export const watchlistQueryKeys = {
  /** Shared root so the disconnect purge in `state/session` can't drift. */
  all: [...WATCHLIST_QUERY_ROOT],
  /** The gathered rows — persisted, and what a successful add invalidates. */
  inputs: () => [...watchlistQueryKeys.all, 'inputs'] as const,
};

/**
 * A watchlist changes only when the user changes it, and the user's own changes
 * are event-driven (`invalidateAfterWatchlist` names this key), so staleness
 * only ever covers another device's edits — 15 minutes plus pull-to-refresh.
 * Matches `CALENDAR_STALE_MS` / `CATALOGUE_STALE_MS`.
 */
export const WATCHLIST_STALE_MS = 15 * 60_000;

export type { WatchlistInput, WatchlistInputs };

/**
 * The providers that contribute a watchlist read. **Not** every readable
 * provider: Serializd is deliberately absent (R32 — its endpoint is known and
 * cheap, but its `items[]` element shape is unverified). Named once so the
 * gather's legs below and the home row's mount gate
 * (`app/(tabs)/index.tsx`, R25) can never disagree about who has a watchlist.
 */
const WATCHLIST_READ_PROVIDERS: readonly ProviderId[] = [
  'trakt',
  'anilist',
  'letterboxd',
];

/**
 * Which of the connected providers this surface can actually read from — the
 * row's mount gate is `length > 0`, which is what finally gives a Trakt-only or
 * AniList-only user a watchlist row (R25).
 */
export function watchlistReadProviders(
  connected: readonly ProviderId[],
): ProviderId[] {
  return providersForFeed(connected).filter((id) =>
    WATCHLIST_READ_PROVIDERS.includes(id),
  );
}

/**
 * Trakt's leg: **one** call, `type=all`. Not split into movies + shows — they
 * are one endpoint, so there is no independent shows outage to isolate, and a
 * second request would only widen the ~7-concurrent mount-time burst
 * (docs/solutions/trakt-transient-network-errors.md). `added/desc` because
 * `addedAt` is what the merged grid sorts by; `rank` is Trakt's own default and
 * a Trakt-side concept this app must not silently reorder.
 */
async function traktInputs(queryClient: QueryClient): Promise<WatchlistInput[]> {
  const items = await queryClient.fetchQuery({
    queryKey: traktQueryKeys.watchlist('all', 'added', 'desc'),
    queryFn: () =>
      Effect.runPromise(
        getWatchlist(traktDeps(), { type: 'all', sortBy: 'added', sortHow: 'desc' }),
      ),
    staleTime: WATCHLIST_STALE_MS,
  });
  // `normalizeWatchlistRow` puts `listed_at` in `lastUpdated` precisely so the
  // merge can order by add-time (KTD-11); `nowIso` would make every row equal.
  return items.map((item) => ({ item, source: 'trakt', addedAt: item.lastUpdated }));
}

/**
 * AniList's leg: a **selector over an already-cached read**, costing zero extra
 * requests warm. Plan 0030 widened the one list request to
 * `status_in: [CURRENT, PLANNING]`, so the plan-to-watch slice is already in
 * the cache — never "fix" this by adding a PLANNING query (30 req/min budget,
 * docs/solutions/anilist-rate-limit-retry-storm.md).
 *
 * No `addedAt`: `MediaList.createdAt` is not part of that shared selection, and
 * widening it to sort one surface is not worth changing the read every other
 * consumer depends on. These rows sort into the undated block.
 */
async function anilistInputs(queryClient: QueryClient): Promise<WatchlistInput[]> {
  const entries = await fetchPlannedAnime(queryClient);
  return entries.map((entry) => ({
    item: entry.item,
    source: 'anilist',
    ...(entry.entryId != null ? { entryId: entry.entryId } : {}),
  }));
}

/** The infinite watchlist entry as the grid holds it: one page per cursor. */
interface WatchlistPages {
  pages: NormalizedMediaItem[][];
}

/**
 * Letterboxd's leg: **`pages.flat()` of the infinite entry**, not the feed
 * row's separate page-1 key. That is load-bearing — the grid pages a 600-film
 * watchlist behind `onEndReached`, and reading only page 1 would both truncate
 * the merge input to 28 films and make every page-2 film that is also on Trakt
 * render as a visible duplicate of a row already on screen instead of merging.
 *
 * Cold it is one page (`pages: 1`), so the cost is unchanged; warm it refetches
 * only the pages already loaded, which is what the grid's own refetch does.
 * The list is **never** auto-paged here to complete dedupe — 22 sequential
 * fetches on mobile data per gather is exactly what plan 0031's scope boundary
 * rules out. `fetchLetterboxdReleaseInputs` keeps its separate page-1 entry.
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
    queryKey,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      Effect.runPromise(getWatchlistPage(letterboxdDeps(), { page: pageParam })),
    initialPageParam: 1,
    getNextPageParam: (lastPage: NormalizedMediaItem[], _pages, lastPageParam: number) =>
      lastPage.length < WATCHLIST_PAGE_SIZE ? undefined : lastPageParam + 1,
    pages: Math.max(cached?.pages.length ?? 1, 1),
    staleTime: WATCHLIST_STALE_MS,
  });
  return data.pages.flat().map((item) => ({ item, source: 'letterboxd' }));
}

/**
 * Every connected provider's watchlist, gathered in parallel and settled
 * per-leg. **No Serializd leg** (R32): its endpoint is known and cheap, but its
 * `items[]` element shape is unverified against a real account and writing a
 * normalizer against a guess is how a data contract rots. The consequence is
 * stated rather than absorbed — v1 writes to a Serializd watchlist it cannot
 * show back, which is also why Serializd's removal stays a manual link.
 *
 * **Never a Calendar source** (R22): plan 0030 KTD-2 deliberately chose
 * `/calendars/my/*` over `/sync/watchlist` + per-item resolution, so this
 * gatherer feeds the watchlist surface only and `fetchUpNextInputs` never
 * calls it.
 */
export async function fetchWatchlistInputs(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
): Promise<WatchlistInputs> {
  const feedProviders = watchlistReadProviders(connected);
  const [trakt, anilist, letterboxd] = await Promise.all([
    feedProviders.includes('trakt')
      ? settle('trakt', () => traktInputs(queryClient))
      : none<WatchlistInput>(),
    feedProviders.includes('anilist')
      ? settle('anilist', () => anilistInputs(queryClient))
      : none<WatchlistInput>(),
    feedProviders.includes('letterboxd')
      ? settle('letterboxd', () => letterboxdInputs(queryClient))
      : none<WatchlistInput>(),
  ]);

  // Only a leg that actually ran and succeeded can be *incomplete* — a failed
  // one is already `errors`, and R35 treats both as unknown membership, so
  // reporting it twice would only make the two lists overlap.
  const incomplete: ProviderId[] =
    feedProviders.includes('letterboxd') &&
    letterboxd.errors.length === 0 &&
    !letterboxdLegIsComplete(queryClient)
      ? ['letterboxd']
      : [];

  return {
    inputs: [...trakt.inputs, ...anilist.inputs, ...letterboxd.inputs],
    errors: [...trakt.errors, ...anilist.errors, ...letterboxd.errors],
    incomplete,
  };
}

export function watchlistOptions(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
) {
  return {
    queryKey: watchlistQueryKeys.inputs(),
    queryFn: () => fetchWatchlistInputs(queryClient, connected),
    staleTime: WATCHLIST_STALE_MS,
  };
}

/**
 * Pull-to-refresh, and the retry behind a failed leg's inline notice (R29).
 *
 * Marks **each leg's own cache entry** stale before refetching the gather. The
 * legs are read through `fetchQuery`/`fetchInfiniteQuery` under a 15-minute
 * `staleTime`, so refetching the gather alone would re-serve exactly the
 * payloads the user pulled to replace — the same "provider keys first, then the
 * gatherer" ordering `invalidateAfterWatchlist` follows, for the same reason.
 *
 * The AniList entry it invalidates is the *shared* list read behind the "Your
 * Anime" row: this refreshes the network read those surfaces already share, it
 * does not change what either of them displays (R28).
 */
export async function refreshWatchlistInputs(
  queryClient: QueryClient,
): Promise<void> {
  const username = getLetterboxdUsername();
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.watchlistRoot() }),
    queryClient.invalidateQueries({
      queryKey: anilistQueryKeys.currentAnimeEntries(),
    }),
    ...(username == null
      ? []
      : [
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
  const connected = useConnectedProviders();
  return useSuspenseQuery(watchlistOptions(queryClient, connected)).data;
}
